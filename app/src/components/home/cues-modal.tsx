import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

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
import { supabase } from '@/lib/supabase';
import type { FakeCue } from '@/lib/types';

export const CUES_DAILY_GOAL = 15;

const CUES: { value: FakeCue; emoji: string; label: string }[] = [
  { value: 'keys', emoji: '🔑', label: 'CLÉS' },
  { value: 'shoes', emoji: '👟', label: 'CHAUSSURES' },
  { value: 'socks', emoji: '🧦', label: 'CHAUSSETTES' },
  { value: 'elevator', emoji: '🛗', label: 'ASCENSEUR' },
  { value: 'stairs', emoji: '🪜', label: 'ESCALIER' },
  { value: 'gate', emoji: '🚧', label: 'PORTAIL' },
];

/**
 * Faux signal de départ : on joue avec les objets déclencheurs sans partir
 * (désensibilisation). Clés + chaussures pré-sélectionnés, objectif
 * 15 par jour.
 */
export function CuesModal({
  visible,
  topOffset,
  dogId,
  todayCount,
  onClose,
  onSaved,
}: {
  visible: boolean;
  topOffset: number;
  dogId: string | null;
  /** Faux signaux déjà notés aujourd'hui (pour l'objectif 15/jour). */
  todayCount: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const colors = useTheme();
  const [selected, setSelected] = useState<FakeCue[]>(['keys', 'shoes']);
  const [notes, setNotes] = useState('');

  // Clés + chaussures re-sélectionnés à chaque ouverture (ajustement
  // pendant le rendu — pas de setState dans un effet).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSelected(['keys', 'shoes']);
      setNotes('');
    }
  }

  const toggle = (cue: FakeCue) => {
    Haptics.selectionAsync();
    setSelected((prev) =>
      prev.includes(cue) ? prev.filter((c) => c !== cue) : [...prev, cue]
    );
  };

  const save = async () => {
    if (!dogId || selected.length === 0) return;
    const { error } = await supabase.from('activities').insert({
      dog_id: dogId,
      kind: 'fake_cue',
      at: new Date().toISOString(),
      cues: selected,
      notes: notes.trim() || null,
    });
    if (error) {
      Alert.alert('Erreur', `Faux signal non enregistré : ${error.message}`);
      return;
    }
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved(`🔑 FAUX SIGNAL NOTÉ · ${todayCount + 1}/${CUES_DAILY_GOAL} AUJOURD'HUI`);
  };

  return (
    <PixelDialog
      visible={visible}
      onRequestClose={onClose}
      title="🔑 FAUX SIGNAUX"
      topOffset={topOffset}>
      <View style={styles.header}>
        <DialogLabel>ON A JOUÉ AVEC QUOI ?</DialogLabel>
        <Text style={[styles.goal, { color: colors.textSecondary }]}>
          {todayCount}/{CUES_DAILY_GOAL} AUJOURD&apos;HUI
        </Text>
      </View>
      {/* Grille 2 colonnes × 3 lignes (la modale s'allonge, tant mieux). */}
      <View style={styles.grid}>
        {[0, 2, 4].map((i) => (
          <View key={i} style={styles.gridRow}>
            {CUES.slice(i, i + 2).map(({ value, emoji, label }) => (
              <Chip
                key={value}
                big
                emoji={emoji}
                label={label}
                selected={selected.includes(value)}
                onPress={() => toggle(value)}
              />
            ))}
          </View>
        ))}
      </View>
      <DialogLabel>COMMENTAIRE</DialogLabel>
      <DialogNotes value={notes} onChangeText={setNotes} placeholder="Réaction d'Ubuntu, contexte…" />
      <DialogButtons
        onCancel={onClose}
        onConfirm={save}
        confirmLabel="CONFIRMER"
        confirmDisabled={selected.length === 0}
      />
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
  grid: {
    gap: Spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
