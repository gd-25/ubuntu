import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime, formatDuration } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { SessionSummary } from '@/lib/types';

export default function HistoryScreen() {
  const colors = useTheme();
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('session_summaries')
      .select('*')
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(100);
    setSummaries((data as SessionSummary[] | null) ?? []);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  const sessionDuration = (summary: SessionSummary) => {
    if (!summary.ended_at) return 0;
    return (new Date(summary.ended_at).getTime() - new Date(summary.started_at).getTime()) / 1000;
  };

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      data={summaries}
      keyExtractor={(item) => item.session_id}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        isLoading ? null : (
          <EmptyState
            title="Aucune session terminée"
            subtitle="Démarrez une session depuis l’onglet Direct : elle apparaîtra ici une fois terminée."
          />
        )
      }
      renderItem={({ item }) => (
        <Link href={{ pathname: '/session/[id]', params: { id: item.session_id } }} asChild>
          <Pressable
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <View style={styles.rowHeader}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                {formatDateTime(item.started_at)}
              </Text>
              <Text style={[styles.calm, { color: colors.success }]}>
                {Math.round(item.calm_percent)} % calme
              </Text>
            </View>
            <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
              Durée {formatDuration(sessionDuration(item))} · {item.episode_count} épisode
              {item.episode_count > 1 ? 's' : ''} · Vocalisé{' '}
              {formatDuration(item.total_vocal_seconds)}
            </Text>
          </Pressable>
        </Link>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
    flexGrow: 1,
  },
  row: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.md,
    gap: 4,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
    textTransform: 'capitalize',
  },
  calm: {
    fontSize: 13,
    fontWeight: '700',
  },
  rowDetail: {
    fontSize: 13,
  },
});
