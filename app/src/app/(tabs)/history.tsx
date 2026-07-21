import * as Haptics from 'expo-haptics';
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, DialogButtons, DialogLabel, PixelDialog } from '@/components/home/pixel-dialog';
import { ScreenTitle } from '@/components/screen-title';
import { Text } from '@/components/text';
import { EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration, formatTime } from '@/lib/format';
import { SPACE_LABELS } from '@/lib/house';
import { supabase } from '@/lib/supabase';
import type { Activity, FakeCue, Night, OverallSession, SessionSummary } from '@/lib/types';

/** Types d'événements du journal (filtrables). */
type EventType =
  | 'session'
  | 'walk'
  | 'meal'
  | 'mat'
  | 'fake_cue'
  | 'care'
  | 'night'
  | 'overall';

const EVENT_DEFS: { type: EventType; emoji: string; label: string }[] = [
  { type: 'session', emoji: '🔴', label: 'SESSIONS' },
  { type: 'night', emoji: '🌙', label: 'NUITS' },
  { type: 'walk', emoji: '🚶', label: 'SORTIES' },
  { type: 'meal', emoji: '🍖', label: 'REPAS' },
  { type: 'mat', emoji: '🐾', label: 'TAPIS' },
  { type: 'fake_cue', emoji: '🔑', label: 'FAUX SIGNAUX' },
  { type: 'overall', emoji: '🎯', label: 'OVERALL' },
  { type: 'care', emoji: '🤝', label: 'GARDES' },
];

const ALL_TYPES = EVENT_DEFS.map((d) => d.type);

const CUE_LABELS: Record<FakeCue, string> = {
  keys: 'clés',
  shoes: 'chaussures',
  socks: 'chaussettes',
  elevator: 'ascenseur',
};

const NIGHT_LOCATION_LABELS = {
  outside_room: 'hors de la chambre',
  in_room: 'dans la chambre, pas sur le lit',
  on_bed: 'sur le lit',
} as const;

const MEAL_KIND_LABELS = { kibble: 'croquettes', pate: 'pâté', other: 'autre' } as const;

const FRACTION_LABELS: Record<number, string> = {
  0.25: '¼',
  0.5: '½',
  0.75: '¾',
  1: 'toute la ration',
};

/** Un événement du flux unifié, prêt à trier et grouper par jour. */
interface FeedItem {
  key: string;
  type: EventType;
  at: string;
  session?: SessionSummary;
  emoji?: string;
  title?: string;
  details?: string[];
}

interface DaySection {
  title: string;
  data: FeedItem[];
}

export default function HistoryScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [overalls, setOveralls] = useState<OverallSession[]>([]);
  const [enabled, setEnabled] = useState<EventType[]>(ALL_TYPES);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [sessionsRes, activitiesRes, nightsRes, overallsRes] = await Promise.all([
      supabase
        .from('session_summaries')
        .select('*')
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase.from('activities').select('*').order('at', { ascending: false }).limit(200),
      supabase.from('nights').select('*').order('started_at', { ascending: false }).limit(60),
      supabase.from('overall_sessions').select('*').order('at', { ascending: false }).limit(60),
    ]);
    if (sessionsRes.error)
      console.warn('Chargement de l’historique impossible :', sessionsRes.error.message);
    setSummaries((sessionsRes.data as SessionSummary[] | null) ?? []);
    setActivities((activitiesRes.data as Activity[] | null) ?? []);
    setNights((nightsRes.data as Night[] | null) ?? []);
    setOveralls((overallsRes.data as OverallSession[] | null) ?? []);
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

  // ---------------------------------------------------- Flux unifié filtré

  const sections = useMemo<DaySection[]>(() => {
    const items: FeedItem[] = [];

    if (enabled.includes('session')) {
      for (const s of summaries) {
        items.push({ key: `s-${s.session_id}`, type: 'session', at: s.started_at, session: s });
      }
    }
    for (const a of activities) {
      if (a.kind === 'walk' && enabled.includes('walk')) {
        const details: string[] = [];
        if (a.ended_at) {
          const seconds = (new Date(a.ended_at).getTime() - new Date(a.at).getTime()) / 1000;
          details.push(`${formatTime(a.at)} → ${formatTime(a.ended_at)} · ${formatDuration(seconds)}`);
        } else {
          details.push(`départ ${formatTime(a.at)} · en cours`);
        }
        const extras = [
          a.poop_small ? '💩 petit' : null,
          a.poop_big ? '💩 gros' : null,
          a.off_leash ? '🐕 liberté' : null,
        ].filter(Boolean);
        if (extras.length) details.push(extras.join(' · '));
        if (a.notes) details.push(a.notes);
        items.push({ key: `a-${a.id}`, type: 'walk', at: a.at, emoji: '🚶', title: 'SORTIE', details });
      } else if (a.kind === 'meal' && enabled.includes('meal')) {
        const details = [
          [
            formatTime(a.at),
            a.meal_fraction != null ? FRACTION_LABELS[a.meal_fraction] ?? `${a.meal_fraction}` : null,
            a.meal_kind ? MEAL_KIND_LABELS[a.meal_kind] : null,
          ]
            .filter(Boolean)
            .join(' · '),
        ];
        if (a.notes) details.push(a.notes);
        items.push({ key: `a-${a.id}`, type: 'meal', at: a.at, emoji: '🍖', title: 'REPAS', details });
      } else if (a.kind === 'mat' && enabled.includes('mat')) {
        items.push({
          key: `a-${a.id}`,
          type: 'mat',
          at: a.at,
          emoji: '🐾',
          title: 'VISITE DU TAPIS',
          details: [formatTime(a.at)],
        });
      } else if (a.kind === 'fake_cue' && enabled.includes('fake_cue')) {
        const cues = (a.cues ?? []).map((c) => CUE_LABELS[c] ?? c).join(' + ');
        items.push({
          key: `a-${a.id}`,
          type: 'fake_cue',
          at: a.at,
          emoji: '🔑',
          title: 'FAUX SIGNAL',
          details: [[formatTime(a.at), cues].filter(Boolean).join(' · ')],
        });
      } else if (a.kind === 'care' && enabled.includes('care')) {
        const details = [
          [
            formatTime(a.at),
            a.caregiver ?? undefined,
            a.duration_minutes ? formatDuration(a.duration_minutes * 60) : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
        ];
        if (a.notes) details.push(a.notes);
        items.push({ key: `a-${a.id}`, type: 'care', at: a.at, emoji: '🤝', title: 'GARDE', details });
      }
    }
    if (enabled.includes('night')) {
      for (const n of nights) {
        const details = [
          `${formatTime(n.started_at)} → ${formatTime(n.ended_at)} · ${NIGHT_LOCATION_LABELS[n.location]}`,
        ];
        if (n.basket_space) details.push(`panier : ${SPACE_LABELS[n.basket_space].toLowerCase()}`);
        if (n.notes) details.push(n.notes);
        // Groupée sur le jour du RÉVEIL (la nuit du 20 au 21 se lit le 21).
        items.push({ key: `n-${n.id}`, type: 'night', at: n.ended_at, emoji: '🌙', title: 'NUIT', details });
      }
    }
    if (enabled.includes('overall')) {
      for (const o of overalls) {
        const details = [
          `${formatTime(o.at)} · ${o.duration_minutes} min · ${o.treats_count} friandise${o.treats_count > 1 ? 's' : ''} · ${SPACE_LABELS[o.mat_space].toLowerCase()}`,
        ];
        if (o.notes) details.push(o.notes);
        items.push({ key: `o-${o.id}`, type: 'overall', at: o.at, emoji: '🎯', title: 'OVERALL', details });
      }
    }

    items.sort((a, b) => (a.at < b.at ? 1 : -1));

    const byDay: DaySection[] = [];
    for (const item of items) {
      const title = formatDate(item.at);
      const last = byDay[byDay.length - 1];
      if (last && last.title === title) last.data.push(item);
      else byDay.push({ title, data: [item] });
    }
    return byDay;
  }, [summaries, activities, nights, overalls, enabled]);

  const toggleType = useCallback((type: EventType) => {
    Haptics.selectionAsync();
    setEnabled((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }, []);

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

  const filterCount = enabled.length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Titre fixe + bouton FILTRER */}
      <View style={styles.titleWrap}>
        <ScreenTitle
          title="JOURNAL"
          right={
            <Pressable
              onPress={() => setFilterOpen(true)}
              style={[
                styles.filterButton,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}>
              <Text style={[styles.filterButtonText, { color: colors.text }]}>
                ⚙ FILTRER{filterCount < ALL_TYPES.length ? ` (${filterCount})` : ''}
              </Text>
            </Pressable>
          }
        />
      </View>
      <SectionList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        sections={sections}
        keyExtractor={(item) => item.key}
        stickySectionHeadersEnabled
        onRefresh={onRefresh}
        refreshing={isRefreshing}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              title="RIEN À AFFICHER"
              subtitle="Aucun événement pour ces filtres. Notez vos premières actions depuis l'écran Maison."
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
        renderItem={({ item }) =>
          item.type === 'session' && item.session ? (
            <SessionRow
              summary={item.session}
              duration={sessionDuration(item.session)}
              onDelete={() => deleteSession(item.session!)}
            />
          ) : (
            <EventRow item={item} />
          )
        }
      />

      {/* Filtres : sélectionner les événements à afficher */}
      <PixelDialog
        visible={filterOpen}
        onRequestClose={() => setFilterOpen(false)}
        title="⚙ FILTRER LE JOURNAL"
        topOffset={insets.top + 40}>
        <DialogLabel>AFFICHER…</DialogLabel>
        {[0, 2, 4, 6].map((i) => (
          <View key={i} style={styles.filterRow}>
            {EVENT_DEFS.slice(i, i + 2).map(({ type, emoji, label }) => (
              <Chip
                key={type}
                emoji={emoji}
                label={label}
                selected={enabled.includes(type)}
                onPress={() => toggleType(type)}
              />
            ))}
          </View>
        ))}
        <DialogButtons
          cancelLabel="TOUT"
          confirmLabel="OK !"
          onCancel={() => setEnabled(ALL_TYPES)}
          onConfirm={() => setFilterOpen(false)}
        />
      </PixelDialog>
    </View>
  );
}

/** Ligne d'un événement simple (tout sauf les sessions). */
function EventRow({ item }: { item: FeedItem }) {
  const colors = useTheme();
  return (
    <View
      style={[
        styles.eventRow,
        { backgroundColor: colors.cardAlt, borderColor: colors.border },
      ]}>
      <Text style={styles.eventEmoji}>{item.emoji}</Text>
      <View style={styles.eventBody}>
        <Text style={[styles.eventTitle, { color: colors.text }]}>{item.title}</Text>
        {(item.details ?? []).map((line, i) => (
          <Text key={i} style={[styles.eventDetail, { color: colors.textSecondary }]}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Carte session (lien vers le détail + suppression par swipe). */
function SessionRow({
  summary,
  duration,
  onDelete,
}: {
  summary: SessionSummary;
  duration: number;
  onDelete: () => void;
}) {
  const colors = useTheme();
  return (
    <SwipeableRow onDelete={onDelete}>
      <Link href={{ pathname: '/session/[id]', params: { id: summary.session_id } }} asChild>
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
              🔴 {formatTime(summary.started_at)}
              {summary.ended_at ? ` → ${formatTime(summary.ended_at)}` : ''}
              {summary.is_exercise === false ? ' · SUBIE' : ''}
            </Text>
            <Text style={[styles.calm, { color: colors.success }]}>
              {Math.round(summary.calm_percent)}%
            </Text>
          </View>
          <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
            Durée {formatDuration(duration)}
          </Text>
          <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
            {summary.episode_count} épisode{summary.episode_count > 1 ? 's' : ''} · vocal{' '}
            {formatDuration(summary.total_vocal_seconds)}
          </Text>
        </Pressable>
      </Link>
    </SwipeableRow>
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
  filterButton: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterButtonText: {
    fontSize: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
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
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: 2,
    borderWidth: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.sm,
  },
  eventEmoji: {
    fontSize: 14,
  },
  eventBody: {
    flex: 1,
    gap: 3,
  },
  eventTitle: {
    fontSize: 8,
  },
  eventDetail: {
    fontSize: 7,
    lineHeight: 11,
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
