import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View, useColorScheme } from 'react-native';

import { DialogButtons, DialogLabel, DialogNotes, PixelDialog } from '@/components/home/pixel-dialog';
import { Spacing } from '@/constants/theme';
import { formatDuration } from '@/lib/format';
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
      setStart(new Date(now.getTime() - 30 * 60 * 1000));
      setEnd(now);
      setNotes('');
    }
  }

  const save = async () => {
    if (!dogId) return;
    // Saisie après coup : si le début dépasse la fin, c'était la veille.
    const at = new Date(start);
    if (at.getTime() > end.getTime()) at.setDate(at.getDate() - 1);
    const { error } = await supabase.from('activities').insert({
      dog_id: dogId,
      kind: 'velcro',
      at: at.toISOString(),
      ended_at: end.toISOString(),
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Erreur', `Velcro non enregistré : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const duration = (end.getTime() - at.getTime()) / 1000;
    onSaved(`🍯 VELCRO NOTÉ (${formatDuration(duration)})`);
  };

  return (
    <PixelDialog visible={visible} onRequestClose={onClose} title="🍯 VELCRO" topOffset={topOffset}>
      <DialogLabel>POT DE COLLE — IL NOUS SUIT PARTOUT</DialogLabel>
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
            maximumDate={new Date()}
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
