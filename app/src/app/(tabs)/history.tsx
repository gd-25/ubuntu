import * as Haptics from 'expo-haptics';
import { Link, useFocusEffect, type Href } from 'expo-router';
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
  stairs: 'escalier',
  gate: 'portail',
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

/** Un événement du flux unifié : deux lignes (titre + info), lien détail,
 * suppression par swipe. */
interface FeedItem {
  key: string;
  type: EventType;
  at: string;
  /** Ligne 1 : emoji + heure(s). */
  title: string;
  /** Ligne 2 : les infos, en une seule ligne. */
  detail: string;
  /** % calme, à droite (sessions de solitude uniquement). */
  calmPercent?: number;
  /** Route du détail (éditable pour tout sauf les sessions). */
  href: Href;
  /** Table + id pour la suppression par swipe. */
  table: 'sessions' | 'activities' | 'nights' | 'overall_sessions';
  id: string;
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
    const info = (parts: (string | null | undefined | false)[]) =>
      parts.filter(Boolean).join(' · ');

    if (enabled.includes('session')) {
      for (const s of summaries) {
        const seconds = s.ended_at
          ? (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000
          : 0;
        items.push({
          key: `s-${s.session_id}`,
          type: 'session',
          at: s.started_at,
          title: `🔴 ${formatTime(s.started_at)}${s.ended_at ? ` → ${formatTime(s.ended_at)}` : ''}`,
          detail: info([
            formatDuration(seconds),
            `${s.episode_count} épisode${s.episode_count > 1 ? 's' : ''}`,
            `vocal ${formatDuration(s.total_vocal_seconds)}`,
            s.is_exercise === false && 'subie',
          ]),
          calmPercent: s.calm_percent,
          href: { pathname: '/session/[id]', params: { id: s.session_id } },
          table: 'sessions',
          id: s.session_id,
        });
      }
    }
    for (const a of activities) {
      const href: Href = { pathname: '/event/[kind]/[id]', params: { kind: 'activity', id: a.id } };
      const base = { table: 'activities' as const, id: a.id, key: `a-${a.id}`, at: a.at, href };
      if (a.kind === 'walk' && enabled.includes('walk')) {
        const seconds = a.ended_at
          ? (new Date(a.ended_at).getTime() - new Date(a.at).getTime()) / 1000
          : null;
        items.push({
          ...base,
          type: 'walk',
          title: `🚶 ${formatTime(a.at)}${a.ended_at ? ` → ${formatTime(a.ended_at)}` : ''}`,
          detail: info([
            seconds != null ? formatDuration(seconds) : 'en cours',
            a.poop_small && '💩 petit',
            a.poop_big && '💩 gros',
            a.off_leash && '🐕 liberté',
            a.notes,
          ]),
        });
      } else if (a.kind === 'meal' && enabled.includes('meal')) {
        items.push({
          ...base,
          type: 'meal',
          title: `🍖 ${formatTime(a.at)}`,
          detail: info([
            a.meal_fraction != null
              ? FRACTION_LABELS[a.meal_fraction] ?? `${a.meal_fraction}`
              : null,
            a.meal_kind ? MEAL_KIND_LABELS[a.meal_kind] : null,
            a.notes,
          ]),
        });
      } else if (a.kind === 'mat' && enabled.includes('mat')) {
        items.push({ ...base, type: 'mat', title: `🐾 ${formatTime(a.at)}`, detail: 'visite du tapis' });
      } else if (a.kind === 'fake_cue' && enabled.includes('fake_cue')) {
        items.push({
          ...base,
          type: 'fake_cue',
          title: `🔑 ${formatTime(a.at)}`,
          detail: info([
            'faux signal',
            (a.cues ?? []).map((c) => CUE_LABELS[c] ?? c).join(' + ') || null,
          ]),
        });
      } else if (a.kind === 'care' && enabled.includes('care')) {
        items.push({
          ...base,
          type: 'care',
          title: `🤝 ${formatTime(a.at)}`,
          detail: info([
            'garde',
            a.caregiver,
            a.duration_minutes ? formatDuration(a.duration_minutes * 60) : null,
            a.notes,
          ]),
        });
      }
    }
    if (enabled.includes('night')) {
      for (const n of nights) {
        items.push({
          key: `n-${n.id}`,
          type: 'night',
          // Groupée sur le jour du RÉVEIL (la nuit du 20 au 21 se lit le 21).
          at: n.ended_at,
          title: `🌙 ${formatTime(n.started_at)} → ${formatTime(n.ended_at)}`,
          detail: info([
            NIGHT_LOCATION_LABELS[n.location],
            n.basket_space ? `panier : ${SPACE_LABELS[n.basket_space].toLowerCase()}` : null,
            n.notes,
          ]),
          href: { pathname: '/event/[kind]/[id]', params: { kind: 'night', id: n.id } },
          table: 'nights',
          id: n.id,
        });
      }
    }
    if (enabled.includes('overall')) {
      for (const o of overalls) {
        items.push({
          key: `o-${o.id}`,
          type: 'overall',
          at: o.at,
          title: `🎯 ${formatTime(o.at)}`,
          detail: info([
            'overall',
            `${o.duration_minutes} min`,
            SPACE_LABELS[o.mat_space].toLowerCase(),
            o.notes,
          ]),
          href: { pathname: '/event/[kind]/[id]', params: { kind: 'overall', id: o.id } },
          table: 'overall_sessions',
          id: o.id,
        });
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

  /** Suppression par swipe, pour tous les types d'entrées. */
  const deleteItem = useCallback(
    (item: FeedItem) => {
      Alert.alert(
        'Supprimer cette entrée ?',
        item.type === 'session'
          ? 'Ses vocalises seront conservées mais détachées de la session.'
          : 'Cette action est définitive.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Supprimer',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase.from(item.table).delete().eq('id', item.id);
              if (error) {
                Alert.alert('Erreur', `Suppression impossible : ${error.message}`);
                return;
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              load();
            },
          },
        ]
      );
    },
    [load]
  );

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
        renderItem={({ item }) => <FeedRow item={item} onDelete={() => deleteItem(item)} />}
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

/**
 * Ligne unifiée du journal : deux lignes (emoji + heures, puis les infos),
 * fond plein sans bordure, % calme à droite pour les sessions de
 * solitude uniquement. Tap → détail, swipe → suppression.
 */
function FeedRow({ item, onDelete }: { item: FeedItem; onDelete: () => void }) {
  const colors = useTheme();
  return (
    <SwipeableRow onDelete={onDelete}>
      <Link href={item.href} asChild>
        <Pressable
          style={({ pressed }) =>
            // Link asChild (Slot) rejects style arrays — return a flattened object.
            StyleSheet.flatten([
              styles.row,
              { backgroundColor: colors.cardAlt, opacity: pressed ? 0.7 : 1 },
            ])
          }>
          <View style={styles.rowHeader}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>{item.title}</Text>
            {item.calmPercent != null ? (
              <Text style={[styles.calm, { color: colors.success }]}>
                {Math.round(item.calmPercent)}%
              </Text>
            ) : null}
          </View>
          <Text style={[styles.rowDetail, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.detail}
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
  // Deux lignes, fond plein, sans bordure.
  row: {
    borderRadius: 2,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 6,
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
  // Le pourcentage de calme, en gros (sessions de solitude uniquement).
  calm: {
    fontSize: 14,
  },
  rowDetail: {
    fontSize: 7,
    lineHeight: 12,
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
