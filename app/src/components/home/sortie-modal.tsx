import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';

import { Chip, DialogButtons, DialogDate, DialogLabel, DialogNotes, PixelDialog } from '@/components/home/pixel-dialog';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, rangeOnDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/**
 * Sortie a posteriori : heures de départ et d'arrivée, cacas (petit /
 * gros, boutons objets « 3D ») et lâché en liberté (grosse balade).
 */
export function SortieModal({
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
  const [day, setDay] = useState<Date>(new Date());
  const [departure, setDeparture] = useState<Date>(new Date());
  const [arrival, setArrival] = useState<Date>(new Date());
  const [poopSmall, setPoopSmall] = useState(false);
  const [poopBig, setPoopBig] = useState(false);
  const [offLeash, setOffLeash] = useState(false);
  const [notes, setNotes] = useState('');

  // Réinitialise le formulaire à chaque ouverture (ajustement pendant le
  // rendu — pas de setState dans un effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const now = new Date();
      setDay(now);
      setDeparture(new Date(now.getTime() - 30 * 60 * 1000));
      setArrival(now);
      setPoopSmall(false);
      setPoopBig(false);
      setOffLeash(false);
      setNotes('');
    }
  }

  const save = async () => {
    if (!dogId) return;
    // Les deux heures vivent sur le jour choisi ; une arrivée avant le
    // départ (ex. 23 h 50 → 00 h 20) passe au lendemain.
    const { start, end } = rangeOnDay(day, departure, arrival);
    const { error } = await supabase.from('activities').insert({
      dog_id: dogId,
      kind: 'walk',
      at: start.toISOString(),
      ended_at: end.toISOString(),
      poop_small: poopSmall,
      poop_big: poopBig,
      off_leash: offLeash,
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Erreur', `Sortie non enregistrée : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const duration = (end.getTime() - start.getTime()) / 1000;
    onSaved(`🚶 SORTIE NOTÉE (${formatDuration(duration)})`);
  };

  return (
    <PixelDialog visible={visible} onRequestClose={onClose} title="🚶 SORTIE" topOffset={topOffset}>
      <DialogDate value={day} onChange={setDay} />
      <View style={styles.timeRow}>
        <View style={styles.timeCol}>
          <DialogLabel>DÉPART</DialogLabel>
          <DateTimePicker
            value={departure}
            mode="time"
            display="compact"
            themeVariant={scheme === 'dark' ? 'dark' : 'light'}
            onChange={(_, date) => {
              if (date) setDeparture(date);
            }}
          />
        </View>
        <View style={styles.timeCol}>
          <DialogLabel>ARRIVÉE</DialogLabel>
          <DateTimePicker
            value={arrival}
            mode="time"
            display="compact"
            themeVariant={scheme === 'dark' ? 'dark' : 'light'}
            onChange={(_, date) => {
              if (date) setArrival(date);
            }}
          />
        </View>
      </View>
      <DialogLabel>PENDANT LA SORTIE ?</DialogLabel>
      <View style={styles.row}>
        <Chip
          big
          emoji="💩"
          emojiSize={15}
          selected={poopSmall}
          onPress={() => setPoopSmall((v) => !v)}
        />
        <Chip
          big
          emoji="💩"
          emojiSize={26}
          selected={poopBig}
          onPress={() => setPoopBig((v) => !v)}
        />
        <Chip big emoji="🐕" selected={offLeash} onPress={() => setOffLeash((v) => !v)} />
      </View>
      {offLeash ? (
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          🐕 LÂCHÉ EN LIBERTÉ — GROSSE BALADE !
        </Text>
      ) : null}
      <DialogNotes value={notes} onChangeText={setNotes} placeholder="Détails (rencontres, reniflage…)" />
      <DialogButtons onCancel={onClose} onConfirm={save} />
    </PixelDialog>
  );
}

const styles = StyleSheet.create({
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timeCol: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  hint: {
    fontSize: 7,
    textAlign: 'center',
  },
});
