import * as Haptics from 'expo-haptics';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut } from 'react-native-reanimated';

import { ScreenTitle } from '@/components/screen-title';
import { Text } from '@/components/text';
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
    const { data, error } = await supabase
      .from('session_summaries')
      .select('*')
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(100);
    if (error) console.warn('Chargement de l’historique impossible :', error.message);
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

  const deleteSession = useCallback((summary: SessionSummary) => {
    Alert.alert(
      'Supprimer la session ?',
      'Ses vocalises seront conservées mais détachées de la session.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('sessions')
              .delete()
              .eq('id', summary.session_id);
            if (error) {
              Alert.alert('Erreur', `Suppression impossible : ${error.message}`);
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSummaries((prev) => prev.filter((s) => s.session_id !== summary.session_id));
          },
        },
      ]
    );
  }, []);

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
      ListHeaderComponent={<ScreenTitle title="JOURNAL" />}
      onRefresh={onRefresh}
      refreshing={isRefreshing}
      ListEmptyComponent={
        isLoading ? null : (
          <EmptyState
            title="AUCUNE SESSION"
            subtitle="Déplacez vos avatars hors de la maison sur la carte : la session apparaîtra ici une fois terminée."
          />
        )
      }
      renderItem={({ item }) => (
        <SwipeableRow item={item} onDelete={() => deleteSession(item)}>
          <Link href={{ pathname: '/session/[id]', params: { id: item.session_id } }} asChild>
            <Pressable
              style={({ pressed }) =>
                // Link asChild (Slot) rejects style arrays — return a flattened object.
                StyleSheet.flatten([
                  styles.row,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ])
              }>
              <View style={styles.rowHeader}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {formatDateTime(item.started_at)}
                </Text>
                <Text style={[styles.calm, { color: colors.success }]}>
                  {Math.round(item.calm_percent)} %
                </Text>
              </View>
              <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
                {formatDuration(sessionDuration(item))} · {item.episode_count} épisode
                {item.episode_count > 1 ? 's' : ''} · vocal{' '}
                {formatDuration(item.total_vocal_seconds)}
              </Text>
            </Pressable>
          </Link>
        </SwipeableRow>
      )}
    />
  );
}

/** Swipe vers la gauche → bouton SUPPRIMER pixel. */
function SwipeableRow({
  item,
  onDelete,
  children,
}: {
  item: SessionSummary;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const colors = useTheme();
  return (
    <Animated.View exiting={FadeOut.duration(180)}>
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            onPress={onDelete}
            style={[
              styles.deleteAction,
              { backgroundColor: colors.danger, borderColor: colors.border },
            ]}>
            <Text style={styles.deleteIcon}>🗑</Text>
            <Text style={[styles.deleteText, { color: colors.accentText }]}>SUPPR.</Text>
          </Pressable>
        )}>
        {children}
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
    flexGrow: 1,
    paddingBottom: 24,
  },
  row: {
    borderRadius: 2,
    borderWidth: 3,
    padding: Spacing.md,
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowTitle: {
    fontSize: 9,
    flexShrink: 1,
    textTransform: 'capitalize',
  },
  calm: {
    fontSize: 9,
  },
  rowDetail: {
    fontSize: 7,
    lineHeight: 12,
  },
  deleteAction: {
    width: 86,
    marginLeft: Spacing.sm,
    borderWidth: 3,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteIcon: {
    fontSize: 16,
  },
  deleteText: {
    fontSize: 7,
  },
});
