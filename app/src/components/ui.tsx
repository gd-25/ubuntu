import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Boîte style « dialogue Pokémon » : coins carrés, double bordure épaisse
 * et ombre portée nette (pas de flou — pixel art oblige).
 */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          boxShadow: `4px 4px 0px 0px ${colors.border}`,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const colors = useTheme();
  return <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'secondary';
  disabled?: boolean;
  loading?: boolean;
}) {
  const colors = useTheme();
  const background =
    variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.card : colors.accent;
  const textColor = variant === 'secondary' ? colors.text : colors.accentText;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : 1,
          // Enfoncement « physique » : le bouton descend sur son ombre.
          boxShadow: pressed ? '0px 0px 0px 0px transparent' : `3px 3px 0px 0px ${colors.border}`,
          transform: pressed ? [{ translateX: 3 }, { translateY: 3 }] : [],
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.buttonLabel, { color: textColor }]}>{label.toUpperCase()}</Text>
      )}
    </Pressable>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  const colors = useTheme();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 2,
    borderWidth: 3,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  button: {
    borderRadius: 2,
    borderWidth: 3,
    paddingVertical: 13,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontSize: 11,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  emptyTitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptySubtitle: {
    fontSize: 9,
    textAlign: 'center',
    lineHeight: 15,
  },
});
