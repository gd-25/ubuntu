import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Chip, DialogButtons, DialogLabel, PixelDialog } from '@/components/home/pixel-dialog';
import { Text, TextInput } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SPACE_LABELS } from '@/lib/house';
import { supabase } from '@/lib/supabase';
import type { Space } from '@/lib/types';

export const OVERALL_DAILY_GOAL = 2;

const DURATIONS = [2, 5, 10, 15, 20, 30] as const;

/** Position finale du tapis pendant la session (unités carte + zone). */
export interface MatPlacement {
  x: number;
  y: number;
  space: Space;
}

/**
 * Session du protocole Overall, ouverte une fois le tapis posé sur le
 * plan : durée, friandises données, observations. La position du tapis
 * est la variable de généralisation (réussit-il partout ?). Objectif
 * 2 par jour.
 */
export function OverallModal({
  visible,
  topOffset,
  dogId,
  placement,
  todayCount,
  onClose,
  onSaved,
}: {
  visible: boolean;
  topOffset: number;
  dogId: string | null;
  placement: MatPlacement | null;
  /** Sessions Overall déjà notées aujourd'hui (objectif 2/jour). */
  todayCount: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const colors = useTheme();
  const [duration, setDuration] = useState<number>(5);
  const [notes, setNotes] = useState('');

  // Réinitialise le formulaire à chaque ouverture (ajustement pendant le
  // rendu — pas de setState dans un effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDuration(5);
      setNotes('');
    }
  }

  const save = async () => {
    if (!dogId || !placement) return;
    const { error } = await supabase.from('overall_sessions').insert({
      dog_id: dogId,
      at: new Date().toISOString(),
      duration_minutes: duration,
      notes: notes.trim() || null,
      mat_x: Math.round(placement.x),
      mat_y: Math.round(placement.y),
      mat_space: placement.space,
    });
    if (error) {
      Alert.alert('Erreur', `Session non enregistrée : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved(
      `🐾 OVERALL NOTÉ (${SPACE_LABELS[placement.space]}) · ${todayCount + 1}/${OVERALL_DAILY_GOAL} AUJOURD'HUI`
    );
  };

  return (
    <PixelDialog
      visible={visible}
      onRequestClose={onClose}
      title="🐾 SESSION OVERALL"
      topOffset={topOffset}>
      <View style={styles.header}>
        <Text style={[styles.place, { color: colors.accent }]}>
          TAPIS : {placement ? SPACE_LABELS[placement.space] : '…'}
        </Text>
        <Text style={[styles.goal, { color: colors.textSecondary }]}>
          {todayCount}/{OVERALL_DAILY_GOAL} AUJOURD&apos;HUI
        </Text>
      </View>
      <DialogLabel>DURÉE (MIN)</DialogLabel>
      <View style={styles.row}>
        {DURATIONS.map((d) => (
          <Chip key={d} label={String(d)} selected={duration === d} onPress={() => setDuration(d)} />
        ))}
      </View>
      <DialogLabel>OBSERVATIONS</DialogLabel>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        multiline
        placeholder="Il s'est posé direct, relevé 2x…"
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.notes,
          { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
        ]}
      />
      <DialogButtons onCancel={onClose} onConfirm={save} confirmLabel="ENREGISTRER" />
    </PixelDialog>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  place: {
    fontSize: 8,
  },
  goal: {
    fontSize: 7,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  notes: {
    borderWidth: 2,
    borderRadius: 2,
    minHeight: 52,
    padding: Spacing.sm,
    fontSize: 8,
    lineHeight: 13,
  },
});
