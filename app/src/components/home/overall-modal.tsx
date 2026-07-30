import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Chip,
  DialogButtons,
  DialogDate,
  DialogLabel,
  DialogNotes,
  PixelDialog,
} from '@/components/home/pixel-dialog';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { combineDayTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';

const DURATIONS = [2, 5, 10, 15, 20, 30] as const;

/**
 * Exercice de dressage (ex-protocole Overall) : date, durée et description
 * libre de ce qui a été travaillé. Plus de positionnement du tapis — les
 * anciennes sessions gardent leur position, les nouvelles n'en ont pas.
 */
export function OverallModal({
  visible,
  topOffset,
  dogId,
  todayCount,
  goal,
  onClose,
  onSaved,
}: {
  visible: boolean;
  topOffset: number;
  dogId: string | null;
  /** Exercices déjà notés aujourd'hui. */
  todayCount: number;
  /** Objectif quotidien (paramétrable dans Réglages). */
  goal: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const colors = useTheme();
  const [day, setDay] = useState<Date>(new Date());
  const [duration, setDuration] = useState<number>(5);
  const [notes, setNotes] = useState('');

  // Réinitialise le formulaire à chaque ouverture (ajustement pendant le
  // rendu — pas de setState dans un effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDay(new Date());
      setDuration(5);
      setNotes('');
    }
  }

  const save = async () => {
    if (!dogId) return;
    const { error } = await supabase.from('overall_sessions').insert({
      dog_id: dogId,
      at: combineDayTime(day, new Date()).toISOString(),
      duration_minutes: duration,
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Erreur', `Exercice non enregistré : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved(`🎯 EXERCICE NOTÉ · ${todayCount + 1}/${goal} AUJOURD'HUI`);
  };

  return (
    <PixelDialog visible={visible} onRequestClose={onClose} title="🎯 EXERCICE" topOffset={topOffset}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <DialogLabel>SESSION DE DRESSAGE</DialogLabel>
        </View>
        <Text style={[styles.goal, { color: colors.textSecondary }]}>
          {todayCount}/{goal} AUJOURD&apos;HUI
        </Text>
      </View>
      <DialogDate value={day} onChange={setDay} />
      <DialogLabel>DURÉE (MIN)</DialogLabel>
      <View style={styles.row}>
        {DURATIONS.map((d) => (
          <Chip key={d} label={String(d)} selected={duration === d} onPress={() => setDuration(d)} />
        ))}
      </View>
      <DialogLabel>DESCRIPTION</DialogLabel>
      <DialogNotes value={notes} onChangeText={setNotes} placeholder="Ce qu'on a travaillé, comment ça s'est passé…" />
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
  headerLabel: {
    flexShrink: 1,
  },
  goal: {
    fontSize: 7,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
});
