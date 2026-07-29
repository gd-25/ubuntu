import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';

import {
  DialogButtons,
  DialogDate,
  DialogLabel,
  DialogNotes,
  PixelDialog,
} from '@/components/home/pixel-dialog';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { rangeOnDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/** Objectif quotidien de semi solo : 1 h par jour. */
export const SEMI_SOLO_DAILY_GOAL_MINUTES = 60;

/**
 * Session semi solo saisie a posteriori : Ubuntu était seul dans une pièce
 * pendant qu'un humain était dans une autre. Juste l'heure de début, l'heure
 * de fin et un commentaire — pas de mesure des couinements, il ne couine
 * quasiment jamais. Objectif 1 h par jour.
 */
export function SemiSoloModal({
  visible,
  topOffset,
  dogId,
  todayMinutes,
  onClose,
  onSaved,
}: {
  visible: boolean;
  topOffset: number;
  dogId: string | null;
  /** Minutes de semi solo déjà notées aujourd'hui (objectif 60 min/j). */
  todayMinutes: number;
  onClose: () => void;
  onSaved: (message: string, minutes: number) => void;
}) {
  const colors = useTheme();
  const scheme = useColorScheme();
  const [day, setDay] = useState<Date>(new Date());
  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');

  // Réinitialise le formulaire à chaque ouverture (ajustement pendant le
  // rendu — pas de setState dans un effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const now = new Date();
      setDay(now);
      setStart(new Date(now.getTime() - 30 * 60 * 1000));
      setEnd(now);
      setNotes('');
    }
  }

  const save = async () => {
    if (!dogId) return;
    // Les deux heures vivent sur le jour choisi ; une fin avant le début
    // (ex. 23 h 50 → 00 h 20) passe au lendemain.
    const range = rangeOnDay(day, start, end);
    const minutes = Math.round((range.end.getTime() - range.start.getTime()) / 60_000);
    const { error } = await supabase.from('semi_solo_sessions').insert({
      dog_id: dogId,
      started_at: range.start.toISOString(),
      ended_at: range.end.toISOString(),
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Erreur', `Semi solo non enregistré : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved(
      `🧍 SEMI SOLO NOTÉ · ${todayMinutes + minutes}/${SEMI_SOLO_DAILY_GOAL_MINUTES} MIN AUJOURD'HUI`,
      minutes
    );
  };

  return (
    <PixelDialog
      visible={visible}
      onRequestClose={onClose}
      title="🧍 SEMI SOLO"
      topOffset={topOffset}>
      <View style={styles.header}>
        <DialogLabel>UBUNTU SEUL DANS SA PIÈCE, TOI DANS UNE AUTRE</DialogLabel>
        <Text style={[styles.goal, { color: colors.textSecondary }]}>
          {todayMinutes}/{SEMI_SOLO_DAILY_GOAL_MINUTES} MIN
        </Text>
      </View>
      <DialogDate value={day} onChange={setDay} />
      <View style={styles.timeRow}>
        <View style={styles.timeCol}>
          <DialogLabel>DÉBUT</DialogLabel>
          <DateTimePicker
            value={start}
            mode="time"
            display="compact"
            themeVariant={scheme === 'dark' ? 'dark' : 'light'}
            onChange={(_, date) => {
              if (date) setStart(date);
            }}
          />
        </View>
        <View style={styles.timeCol}>
          <DialogLabel>FIN</DialogLabel>
          <DateTimePicker
            value={end}
            mode="time"
            display="compact"
            themeVariant={scheme === 'dark' ? 'dark' : 'light'}
            onChange={(_, date) => {
              if (date) setEnd(date);
            }}
          />
        </View>
      </View>
      <DialogLabel>COMMENTAIRE</DialogLabel>
      <DialogNotes value={notes} onChangeText={setNotes} placeholder="Comment ça s'est passé…" />
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
  goal: {
    fontSize: 7,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timeCol: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
});
