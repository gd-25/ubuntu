import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { DialogButtons, DialogLabel, PixelDialog } from '@/components/home/pixel-dialog';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import type { NightLocation } from '@/lib/types';

const LOCATIONS: { value: NightLocation; emoji: string; label: string }[] = [
  { value: 'outside_room', emoji: '🚪', label: 'HORS DE LA CHAMBRE FERMÉE' },
  { value: 'in_room', emoji: '🛋', label: 'DANS LA CHAMBRE, PAS SUR LE LIT' },
  { value: 'on_bed', emoji: '🛏', label: 'SUR LE LIT' },
];

/**
 * Nuit de dodo : où a-t-il dormi + plage horaire. Les couinements de la
 * nuit détectés par YAMNet sont des épisodes orphelins (sans session ni
 * vidéo) : on les lie par plage horaire — le compte est annoncé à la
 * sauvegarde, la timeline se lit dans le détail de la nuit.
 */
export function DodoModal({
  visible,
  topOffset,
  dogId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  topOffset: number;
  dogId: string | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const colors = useTheme();
  const scheme = useColorScheme();
  const [location, setLocation] = useState<NightLocation | null>(null);
  const [bedTime, setBedTime] = useState<Date>(new Date());
  const [wakeTime, setWakeTime] = useState<Date>(new Date());

  // Réinitialise le formulaire à chaque ouverture (ajustement pendant le
  // rendu — pas de setState dans un effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setLocation(null);
      const bed = new Date();
      bed.setHours(23, 0, 0, 0);
      const wake = new Date();
      wake.setHours(8, 0, 0, 0);
      setBedTime(bed);
      setWakeTime(wake);
    }
  }

  const save = async () => {
    if (!dogId || !location) return;
    // Le coucher est la veille dès qu'il est plus tard que le lever
    // (23 h 00 → 08 h 00) ; les deux heures sont éditables.
    const started = new Date(bedTime);
    const ended = new Date(wakeTime);
    if (started.getTime() >= ended.getTime()) started.setDate(started.getDate() - 1);

    const { error } = await supabase.from('nights').insert({
      dog_id: dogId,
      started_at: started.toISOString(),
      ended_at: ended.toISOString(),
      location,
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
      <DialogLabel>OÙ A-T-IL DORMI ?</DialogLabel>
      {LOCATIONS.map(({ value, emoji, label }) => (
        <Pressable
          key={value}
          onPress={() => setLocation(value)}
          style={[
            styles.option,
            {
              backgroundColor: location === value ? colors.accent : colors.background,
              borderColor: colors.border,
            },
          ]}>
          <Text style={styles.optionEmoji}>{emoji}</Text>
          <Text
            style={[
              styles.optionText,
              { color: location === value ? colors.accentText : colors.text },
            ]}>
            {label}
          </Text>
        </Pressable>
      ))}
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
  },
  optionEmoji: {
    fontSize: 14,
  },
  optionText: {
    fontSize: 8,
    lineHeight: 12,
    flexShrink: 1,
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
