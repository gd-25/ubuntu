import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';

import { DialogButtons, DialogDate, DialogLabel, DialogNotes, PixelDialog } from '@/components/home/pixel-dialog';
import { Spacing } from '@/constants/theme';
import { formatDuration, rangeOnDay } from '@/lib/format';
import { supabase } from '@/lib/supabase';

/**
 * Velcro : Ubuntu pot de colle 🍯 — il nous suit partout, collé à nous.
 * Heure de début et de fin + notes, comme une sortie.
 */
export function VelcroModal({
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
    const { error } = await supabase.from('activities').insert({
      dog_id: dogId,
      kind: 'velcro',
      at: range.start.toISOString(),
      ended_at: range.end.toISOString(),
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Erreur', `Velcro non enregistré : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const duration = (range.end.getTime() - range.start.getTime()) / 1000;
    onSaved(`🍯 VELCRO NOTÉ (${formatDuration(duration)})`);
  };

  return (
    <PixelDialog visible={visible} onRequestClose={onClose} title="🍯 VELCRO" topOffset={topOffset}>
      <DialogLabel>POT DE COLLE — IL NOUS SUIT PARTOUT</DialogLabel>
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
      <DialogNotes value={notes} onChangeText={setNotes} placeholder="Contexte (retour de balade, invités…)" />
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
});
