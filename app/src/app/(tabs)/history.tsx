import * as Haptics from 'expo-haptics';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { ScreenTitle } from '@/components/screen-title';
import { Text } from '@/components/text';
import { EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration, formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { SessionSummary } from '@/lib/types';

interface DaySection {
  title: string;
  data: SessionSummary[];
}

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

  // Sessions regroupées par jour (l'ordre du fetch — récentes d'abord — est conservé).
  const sections = useMemo<DaySection[]>(() => {
    const byDay: DaySection[] = [];
    for (const summary of summaries) {
      const title = formatDate(summary.started_at);
      const last = byDay[byDay.length - 1];
      if (last && last.title === title) last.data.push(summary);
      else byDay.push({ title, data: [summary] });
    }
    return byDay;
  }, [summaries]);

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
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Titre hors de la liste : il reste fixe pendant le scroll */}
      <View style={styles.titleWrap}>
        <ScreenTitle title="JOURNAL" />
      </View>
      <SectionList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => item.session_id}
      stickySectionHeadersEnabled
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
      renderSectionHeader={({ section }) => (
        <View style={[styles.dayHeader, { backgroundColor: colors.background }]}>
          <View
            style={[styles.dayChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.dayChipText, { color: colors.text }]}>
              {section.title.toUpperCase()}
            </Text>
          </View>
        </View>
      )}
      renderItem={({ item }) => (
        <SwipeableRow onDelete={() => deleteSession(item)}>
          <Link href={{ pathname: '/session/[id]', params: { id: item.session_id } }} asChild>
            <Pressable
              style={({ pressed }) =>
                // Link asChild (Slot) rejects style arrays — return a flattened object.
                StyleSheet.flatten([
                  styles.row,
                  {
                    backgroundColor: colors.cardAlt,
                    borderColor: colors.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ])
              }>
              <View style={styles.rowHeader}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>
                  {formatTime(item.started_at)}
                  {item.ended_at ? ` → ${formatTime(item.ended_at)}` : ''}
                </Text>
                <Text style={[styles.calm, { color: colors.success }]}>
                  {Math.round(item.calm_percent)}%
                </Text>
              </View>
              <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
                Durée {formatDuration(sessionDuration(item))}
              </Text>
              <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
                {item.episode_count} épisode{item.episode_count > 1 ? 's' : ''} · vocal{' '}
                {formatDuration(item.total_vocal_seconds)}
              </Text>
            </Pressable>
          </Link>
        </SwipeableRow>
      )}
      />
    </View>
  );
}

/** Largeur du bouton SUPPRIMER + sa marge (pour le slide-in). */
const DELETE_WIDTH = 104 + Spacing.sm;

/**
 * Bouton SUPPRIMER qui GLISSE depuis le bord droit en suivant le doigt
 * (au lieu d'être simplement révélé sous la ligne).
 */
function DeleteAction({
  drag,
  onDelete,
}: {
  drag: SharedValue<number>;
  onDelete: () => void;
}) {
  const colors = useTheme();
  const slideIn = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + DELETE_WIDTH }],
  }));
  return (
    <Animated.View style={slideIn}>
      <Pressable
        onPress={onDelete}
        style={[
          styles.deleteAction,
          { backgroundColor: colors.danger, borderColor: colors.border },
        ]}>
        <Text style={[styles.deleteText, { color: colors.accentText }]}>SUPPRIMER</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Swipe vers la gauche → bouton SUPPRIMER pixel. */
function SwipeableRow({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <Animated.View exiting={FadeOut.duration(160)} style={styles.rowWrapper}>
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={(_progress, drag) => (
          <DeleteAction drag={drag} onDelete={onDelete} />
        )}>
        {children}
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  titleWrap: {
    paddingHorizontal: Spacing.md,
  },
  content: {
    padding: Spacing.md,
    paddingTop: Spacing.xs,
    flexGrow: 1,
    paddingBottom: 24,
  },
  dayHeader: {
    paddingVertical: 6,
  },
  dayChip: {
    alignSelf: 'flex-start',
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dayChipText: {
    fontSize: 8,
  },
  rowWrapper: {
    marginBottom: Spacing.sm,
  },
  row: {
    borderRadius: 2,
    borderWidth: 3,
    paddingHorizontal: Spacing.md,
    paddingVertical: 18,
    minHeight: 96,
    justifyContent: 'center',
    gap: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowTitle: {
    fontSize: 10,
    flexShrink: 1,
  },
  // Le pourcentage de calme, en gros (le « % CALME » d'avant est implicite).
  calm: {
    fontSize: 16,
  },
  rowDetail: {
    fontSize: 8,
    lineHeight: 13,
  },
  deleteAction: {
    flex: 1,
    width: 104,
    marginLeft: Spacing.sm,
    borderWidth: 3,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 8,
  },
});
