import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Chip, DialogButtons, DialogLabel, DialogNotes, PixelDialog } from '@/components/home/pixel-dialog';
import { TextInput } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

const DURATIONS = [
  { minutes: 30, label: '30 MIN' },
  { minutes: 60, label: '1 H' },
  { minutes: 120, label: '2 H' },
  { minutes: 180, label: '3 H' },
  { minutes: 240, label: '½ JOUR' },
  { minutes: 480, label: 'JOUR' },
] as const;

/** Garde : Ubuntu est gardé par quelqu'un (nom + durée). */
export function GardeModal({
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
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState<number>(120);
  const [notes, setNotes] = useState('');

  // Réinitialise le formulaire à chaque ouverture (ajustement pendant le
  // rendu — pas de setState dans un effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName('');
      setMinutes(120);
      setNotes('');
    }
  }

  const save = async () => {
    if (!dogId || !name.trim()) return;
    const { error } = await supabase.from('activities').insert({
      dog_id: dogId,
      kind: 'care',
      at: new Date().toISOString(),
      caregiver: name.trim(),
      duration_minutes: minutes,
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Erreur', `Garde non enregistrée : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved(`🤝 GARDE NOTÉE : ${name.trim().toUpperCase()}`);
  };

  return (
    <PixelDialog visible={visible} onRequestClose={onClose} title="🤝 GARDE" topOffset={topOffset}>
      <DialogLabel>QUI LE GARDE ?</DialogLabel>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nom de la personne"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="words"
        style={[
          styles.input,
          { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
        ]}
      />
      <DialogLabel>COMBIEN DE TEMPS ?</DialogLabel>
      <View style={styles.row}>
        {DURATIONS.slice(0, 3).map(({ minutes: m, label }) => (
          <Chip key={m} label={label} selected={minutes === m} onPress={() => setMinutes(m)} />
        ))}
      </View>
      <View style={styles.row}>
        {DURATIONS.slice(3).map(({ minutes: m, label }) => (
          <Chip key={m} label={label} selected={minutes === m} onPress={() => setMinutes(m)} />
        ))}
      </View>
      <DialogNotes value={notes} onChangeText={setNotes} placeholder="Détails (comment ça s'est passé…)" />
      <DialogButtons onCancel={onClose} onConfirm={save} confirmDisabled={!name.trim()} />
    </PixelDialog>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 2,
    borderRadius: 2,
    padding: Spacing.sm,
    fontSize: 9,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
