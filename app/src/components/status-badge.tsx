import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';
import type { AgentStatus } from '@/lib/types';

export type AgentDisplayStatus = AgentStatus | 'stale' | 'unknown';

const LABELS: Record<AgentDisplayStatus, string> = {
  listening: 'À L’ÉCOUTE',
  camera_unreachable: 'CAMÉRA HS',
  offline: 'HORS LIGNE',
  stale: 'HORS LIGNE',
  unknown: 'INCONNU',
};

/** Badge pixel : carré de statut + label en majuscules. */
export function StatusBadge({ status }: { status: AgentDisplayStatus }) {
  const colors = useTheme();
  const dotColor =
    status === 'listening'
      ? colors.success
      : status === 'camera_unreachable'
        ? colors.warning
        : status === 'unknown'
          ? colors.textSecondary
          : colors.danger;

  return (
    <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.dot, { backgroundColor: dotColor, borderColor: colors.border }]} />
      <Text style={[styles.label, { color: colors.text }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 2,
    borderWidth: 2,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderWidth: 1,
  },
  label: {
    fontSize: 8,
  },
});
