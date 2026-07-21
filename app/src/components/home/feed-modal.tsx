import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';

import { Chip, DialogButtons, DialogLabel, DialogNotes, PixelDialog } from '@/components/home/pixel-dialog';
import { Spacing } from '@/constants/theme';
import { formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { MealKind } from '@/lib/types';

const MEAL_FRACTIONS = [
  { value: 0.25, label: '¼' },
  { value: 0.5, label: '½' },
  { value: 0.75, label: '¾' },
  { value: 1, label: 'TOUT' },
] as const;

const MEAL_KINDS: { value: MealKind; emoji: string; label: string }[] = [
  { value: 'kibble', emoji: '🦴', label: 'CROQS' },
  { value: 'pate', emoji: '🥫', label: 'PÂTÉ' },
  { value: 'other', emoji: '🍗', label: 'AUTRE' },
];

/** Repas : fraction de la ration + heure (spinner rétro). */
export function FeedModal({
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
  const scheme = useColorScheme();
  const [fraction, setFraction] = useState<number>(0.5);
  const [kind, setKind] = useState<MealKind>('kibble');
  const [notes, setNotes] = useState('');
  const [time, setTime] = useState<Date>(new Date());

  // Réinitialise le formulaire à chaque ouverture (ajustement pendant le
  // rendu — pas de setState dans un effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setFraction(0.5);
      setKind('kibble');
      setNotes('');
      setTime(new Date());
    }
  }

  const save = async () => {
    if (!dogId) return;
    const at = new Date(Math.min(time.getTime(), Date.now()));
    const { error } = await supabase.from('activities').insert({
      dog_id: dogId,
      kind: 'meal',
      at: at.toISOString(),
      meal_fraction: fraction,
      meal_kind: kind,
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Erreur', `Repas non enregistré : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved(`🍖 REPAS NOTÉ À ${formatTime(at.toISOString())}`);
  };

  return (
    <PixelDialog visible={visible} onRequestClose={onClose} title="🍖 NOURRITURE" topOffset={topOffset}>
      <DialogLabel>QUOI ?</DialogLabel>
      <View style={styles.row}>
        {MEAL_KINDS.map(({ value, emoji, label }) => (
          <Chip
            key={value}
            emoji={emoji}
            label={label}
            selected={kind === value}
            onPress={() => setKind(value)}
          />
        ))}
      </View>
      <DialogLabel>QUELLE PART DE SA RATION ?</DialogLabel>
      <View style={styles.row}>
        {MEAL_FRACTIONS.map(({ value, label }) => (
          <Chip
            key={value}
            label={label}
            selected={fraction === value}
            onPress={() => setFraction(value)}
          />
        ))}
      </View>
      <DialogNotes value={notes} onChangeText={setNotes} placeholder="Détails (restes, appétit…)" />
      <DialogLabel>À QUELLE HEURE ?</DialogLabel>
      <DateTimePicker
        value={time}
        mode="time"
        display="spinner"
        maximumDate={new Date()}
        themeVariant={scheme === 'dark' ? 'dark' : 'light'}
        onChange={(_, date) => {
          if (date) setTime(date);
        }}
        style={styles.timePicker}
      />
      <DialogButtons onCancel={onClose} onConfirm={save} />
    </PixelDialog>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timePicker: {
    alignSelf: 'center',
  },
});
