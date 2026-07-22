import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { MapFocus } from '@/components/home/map-focus';
import {
  Chip,
  DialogButtons,
  DialogLabel,
  DialogNotes,
  PixelDialog,
} from '@/components/home/pixel-dialog';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { spaceAt, SPACE_LABELS, type Spot } from '@/lib/house';
import { supabase } from '@/lib/supabase';
import type { NightLocation } from '@/lib/types';

/** Où a-t-il dormi, relativement à la chambre (le panier donne le reste). */
const LOCATIONS: { value: NightLocation; emoji: string; label: string }[] = [
  { value: 'in_room', emoji: '🛏', label: 'DANS LA CHAMBRE' },
  { value: 'outside_room', emoji: '🚪', label: 'EN DEHORS' },
  { value: 'half_half', emoji: '🌗', label: 'MOITIÉ MOITIÉ' },
];

/** On peut noter la nuit dernière ou remonter jusqu'à 2 nuits en arrière. */
const NIGHT_OFFSETS = [0, 1, 2] as const;

/** « NUIT DU 20 » : jour du coucher pour la nuit à `offset`. */
function nightLabel(offset: number): string {
  const start = new Date();
  start.setDate(start.getDate() - offset - 1);
  return `NUIT DU ${start.getDate()}`;
}

/**
 * Nuit de dodo : quelle nuit + où (relativement à la chambre) + plage
 * horaire. Les couinements de la nuit détectés par YAMNet sont des épisodes
 * orphelins (sans session ni vidéo) : on les lie par plage horaire — le
 * compte est annoncé à la sauvegarde, la timeline se lit dans le détail.
 */
export function DodoModal({
  visible,
  openId,
  topOffset,
  dogId,
  basketPos,
  onRepositionBasket,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** Incrémenté à chaque OUVERTURE depuis le bouton : reset du formulaire.
      Une réouverture après repositionnement du panier garde le même id
      (l'état saisi est conservé). */
  openId: number;
  topOffset: number;
  dogId: string | null;
  /** Position actuelle du panier (centre, unités carte). */
  basketPos: Spot;
  /** Ferme la modale pour replacer le panier sur le plan. */
  onRepositionBasket: () => void;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const colors = useTheme();
  const scheme = useColorScheme();
  const [location, setLocation] = useState<NightLocation | null>(null);
  const [nightOffset, setNightOffset] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [bedTime, setBedTime] = useState<Date>(new Date());
  const [wakeTime, setWakeTime] = useState<Date>(new Date());

  // Réinitialise le formulaire à chaque NOUVELLE ouverture (openId), pas
  // à la réouverture après repositionnement du panier (ajustement pendant
  // le rendu — pas de setState dans un effet).
  const [lastOpenId, setLastOpenId] = useState(openId);
  if (openId !== lastOpenId) {
    setLastOpenId(openId);
    setLocation(null);
    setNightOffset(0);
    setNotes('');
    const bed = new Date();
    bed.setHours(23, 0, 0, 0);
    const wake = new Date();
    wake.setHours(8, 0, 0, 0);
    setBedTime(bed);
    setWakeTime(wake);
  }

  const save = async () => {
    if (!dogId || !location) return;
    // La nuit choisie recule lever ET coucher de `nightOffset` jours ; le
    // coucher est la veille dès qu'il est plus tard que le lever
    // (23 h 00 → 08 h 00). Les deux heures sont éditables.
    const started = new Date(bedTime);
    const ended = new Date(wakeTime);
    started.setDate(started.getDate() - nightOffset);
    ended.setDate(ended.getDate() - nightOffset);
    if (started.getTime() >= ended.getTime()) started.setDate(started.getDate() - 1);

    const { error } = await supabase.from('nights').insert({
      dog_id: dogId,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      location,
      notes: notes.trim() || null,
      basket_x: Math.round(basketPos.x),
      basket_y: Math.round(basketPos.y),
      basket_space: spaceAt(basketPos.x, basketPos.y),
    });
    if (error) {
      Alert.alert('Erreur', `Nuit non enregistrée : ${error.message}`);
      return;
    }

    // Vocalises de la nuit : les épisodes YAMNet de la plage (orphelins —
    // la nuit n'est pas une session, il n'y a pas de vidéo).
    const { count } = await supabase
      .from('vocal_episodes')
      .select('id', { count: 'exact', head: true })
      .eq('dog_id', dogId)
      .gte('started_at', started.toISOString())
      .lte('started_at', ended.toISOString());

    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const n = count ?? 0;
    onSaved(
      n === 0
        ? '🌙 NUIT NOTÉE · AUCUNE VOCALISE 🎉'
        : `🌙 NUIT NOTÉE · ${n} VOCALISE${n > 1 ? 'S' : ''} DANS LA NUIT`
    );
  };

  return (
    <PixelDialog visible={visible} onRequestClose={onClose} title="🌙 DODO" topOffset={topOffset}>
      <DialogLabel>QUELLE NUIT ?</DialogLabel>
      <View style={styles.row}>
        {NIGHT_OFFSETS.map((offset) => (
          <Chip
            key={offset}
            label={nightLabel(offset)}
            selected={nightOffset === offset}
            onPress={() => setNightOffset(offset)}
          />
        ))}
      </View>
      <DialogLabel>OÙ ?</DialogLabel>
      <View style={styles.row}>
        {LOCATIONS.map(({ value, emoji, label }) => (
          <Chip
            key={value}
            emoji={emoji}
            label={label}
            selected={location === value}
            onPress={() => setLocation(value)}
          />
        ))}
      </View>
      <View style={styles.basketHeader}>
        <DialogLabel>POSITION DU PANIER · {SPACE_LABELS[spaceAt(basketPos.x, basketPos.y)]}</DialogLabel>
        <Pressable onPress={onRepositionBasket} hitSlop={6}>
          <Text style={[styles.modify, { color: colors.accent }]}>MODIFIER</Text>
        </Pressable>
      </View>
      <MapFocus center={basketPos} night={scheme === 'dark'} />
      <DialogNotes value={notes} onChangeText={setNotes} placeholder="Détails de la nuit…" />
      <View style={styles.timeRow}>
        <View style={styles.timeCol}>
          <DialogLabel>COUCHER</DialogLabel>
          <DateTimePicker
            value={bedTime}
            mode="time"
            display="compact"
            themeVariant={scheme === 'dark' ? 'dark' : 'light'}
            onChange={(_, date) => {
              if (date) setBedTime(date);
            }}
          />
        </View>
        <View style={styles.timeCol}>
          <DialogLabel>LEVER</DialogLabel>
          <DateTimePicker
            value={wakeTime}
            mode="time"
            display="compact"
            themeVariant={scheme === 'dark' ? 'dark' : 'light'}
            onChange={(_, date) => {
              if (date) setWakeTime(date);
            }}
          />
        </View>
      </View>
      <DialogButtons onCancel={onClose} onConfirm={save} confirmDisabled={!location} />
    </PixelDialog>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  basketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  modify: {
    fontSize: 8,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
  },
  timeCol: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
});
