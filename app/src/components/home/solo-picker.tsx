import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';

import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DepartureState } from '@/lib/types';

const STATES: { value: DepartureState; emoji: string; label: string }[] = [
  { value: 'asleep', emoji: '😴', label: 'ENDORMI' },
  { value: 'settled', emoji: '😌', label: 'POSÉ' },
  { value: 'active', emoji: '⚡', label: 'ACTIF' },
  { value: 'following', emoji: '👀', label: 'NOUS SUIVAIT' },
];

/**
 * Mini-picker affiché juste après le tap SOLO : l'état d'Ubuntu au moment
 * du départ (la variable la plus prédictive), capturé en un seul tap —
 * pas de modale complète.
 */
export function SoloPicker({
  top,
  onPick,
  onDismiss,
}: {
  top: number;
  onPick: (state: DepartureState) => void;
  onDismiss: () => void;
}) {
  const colors = useTheme();
  return (
    <Animated.View
      entering={SlideInUp.duration(240)}
      exiting={SlideOutUp.duration(160)}
      style={[
        styles.panel,
        {
          top,
          backgroundColor: colors.card,
          borderColor: colors.border,
          boxShadow: `4px 4px 0px 0px ${colors.border}`,
        },
      ]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.accent }]}>IL ÉTAIT COMMENT AU DÉPART ?</Text>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Text style={[styles.dismiss, { color: colors.textSecondary }]}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        {STATES.map(({ value, emoji, label }) => (
          <Pressable
            key={value}
            onPress={() => onPick(value)}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                opacity: pressed ? 0.6 : 1,
              },
            ]}>
            <Text style={styles.optionEmoji}>{emoji}</Text>
            <Text style={[styles.optionText, { color: colors.text }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.md,
    gap: Spacing.sm,
    zIndex: 130,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: 8,
    flexShrink: 1,
  },
  dismiss: {
    fontSize: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 9,
    paddingHorizontal: 2,
  },
  optionEmoji: {
    fontSize: 16,
  },
  optionText: {
    fontSize: 5.5,
  },
});
