import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';
import type { AgentStatus } from '@/lib/types';

export type AgentDisplayStatus = AgentStatus | 'stale' | 'unknown';

const LABELS: Record<AgentDisplayStatus, string> = {
  listening: 'En ligne — à l’écoute',
  camera_unreachable: 'Caméra injoignable',
  offline: 'Hors ligne',
  stale: 'Hors ligne (aucun signal récent)',
  unknown: 'Statut inconnu',
};

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
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, { color: colors.text }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
});
