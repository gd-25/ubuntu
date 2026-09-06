import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { SlideInUp } from 'react-native-reanimated';

import { EpisodeRow } from '@/components/episode-row';
import { EpisodeTimeline } from '@/components/episode-timeline';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  episodeDurationSeconds,
  formatChrono,
  formatDuration,
  formatVolume,
  KIND_LABELS,
  secondsSince,
} from '@/lib/format';
import type { ObservedKind, Session, VocalEpisode } from '@/lib/types';

/** Un épisode dont le ended_at a bougé il y a < 6 s est encore en cours
    (l'agent le prolonge toutes les 2 s pendant la vocalise). */
const ONGOING_THRESHOLD_MS = 6_000;

/**
 * Panneau de la session de solitude en cours (boîte de dialogue Pokémon,
 * en haut de l'écran MAISON). Répond à « est-ce que ça va, là ? » :
 * compteur de silence en élément central, frise exponentielle (dernière
 * minute = moitié droite), stats clés, 5 derniers épisodes avec clip.
 */
export function SessionPanel({
  session,
  episodes,
  now,
  lastQuickLog,
  onLogWhine,
  onLogObservation,
  onStop,
  onOpenDetail,
  top,
}: {
  session: Session;
  /** Épisodes bruts de la session (les écartés sont filtrés ici). */
  episodes: VocalEpisode[];
  /** Tick à la seconde (Date.now()) fourni par l'écran. */
  now: number;
  lastQuickLog: string | null;
  onLogWhine: () => void;
  onLogObservation: (kind: ObservedKind) => void;
  onStop: () => void;
  onOpenDetail: () => void;
  top: number;
}) {
  const colors = useTheme();

  const stats = useMemo(() => {
    const active = episodes
      .filter((e) => !e.dismissed)
      .sort((a, b) => (a.started_at < b.started_at ? -1 : 1));
    const startMs = new Date(session.started_at).getTime();
    const vocalSeconds = active.reduce(
      (sum, e) => sum + episodeDurationSeconds(e.started_at, e.ended_at),
      0
    );
    const rmsValues = active
      .map((e) => e.peak_rms)
      .filter((v): v is number => v != null && v > 0);
    const avgRms = rmsValues.length
      ? rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length
      : null;

    // Silences : début → 1er épisode, entre épisodes, dernier → maintenant.
    const gaps: number[] = [];
    let cursor = startMs;
    for (const e of active) {
      const from = new Date(e.started_at).getTime();
      if (from > cursor) gaps.push((from - cursor) / 1000);
      cursor = Math.max(cursor, new Date(e.ended_at).getTime());
    }
    const runningSilence = Math.max(0, (now - cursor) / 1000);
    const allGaps = [...gaps, runningSilence];
    const maxSilence = Math.max(...allGaps);
    const avgSilence = allGaps.reduce((a, b) => a + b, 0) / allGaps.length;

    const last = active[active.length - 1] ?? null;
    const ongoing =
      last && now - new Date(last.ended_at).getTime() < ONGOING_THRESHOLD_MS ? last : null;
    /** Reprises rapprochées : épisodes démarrés dans les 2 dernières minutes. */
    const recentBursts = active.filter(
      (e) => now - new Date(e.started_at).getTime() < 120_000
    ).length;

    const elapsed = Math.max(1, (now - startMs) / 1000);
    const calmPercent = Math.max(0, Math.min(100, 100 * (1 - vocalSeconds / elapsed)));

    return {
      active,
      vocalSeconds,
      avgRms,
      maxSilence,
      avgSilence,
      runningSilence,
      ongoing,
      recentBursts,
      calmPercent,
      elapsed,
    };
  }, [episodes, session.started_at, now]);

  // Le compteur verdit à mesure que le silence s'installe.
  const silenceColor =
    stats.runningSilence < 60 ? colors.textSecondary : colors.success;
  const lastFive = [...stats.active].reverse().slice(0, 5);

  return (
    <Animated.View
      entering={SlideInUp.duration(260)}
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
        <Text style={[styles.title, { color: colors.accent }]}>
          {session.solitude_type === 'in_home' ? '● SEMI-SEUL (AUTRE PIÈCE)' : '● SEUL'}
        </Text>
        <Text style={[styles.chrono, { color: colors.text }]}>
          {formatChrono(secondsSince(session.started_at, now))}
        </Text>
      </View>
      <Text style={[styles.detail, { color: colors.textSecondary }]}>
        SEUL DEPUIS {formatDuration(stats.elapsed).toUpperCase()} ·{' '}
        {Math.round(stats.calmPercent)}%
      </Text>

      {/* --------- Le bloc central : silence en cours OU vocalise en cours */}
      {stats.ongoing ? (
        <View
          style={[styles.silenceBox, { backgroundColor: colors.card, borderColor: colors.danger }]}>
          <Text style={[styles.silenceLabel, { color: colors.danger }]}>VOCALISE EN COURS</Text>
          <Text style={[styles.ongoingValue, { color: colors.danger }]}>
            {(KIND_LABELS[stats.ongoing.kind] ?? '').toUpperCase()} ·{' '}
            {formatDuration(
              episodeDurationSeconds(stats.ongoing.started_at, stats.ongoing.ended_at)
            ).toUpperCase()}
            {formatVolume(stats.ongoing.peak_rms) ? ` · ${formatVolume(stats.ongoing.peak_rms)}` : ''}
          </Text>
          {stats.recentBursts > 1 ? (
            <Text style={[styles.silenceSub, { color: colors.textSecondary }]}>
              {stats.recentBursts}E REPRISE EN 2 MIN
            </Text>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.silenceBox,
            { backgroundColor: colors.cardAlt, borderColor: colors.border },
          ]}>
          <Text style={[styles.silenceLabel, { color: colors.textSecondary }]}>
            SILENCIEUX DEPUIS
          </Text>
          <Text style={[styles.silenceValue, { color: silenceColor }]}>
            {formatChrono(stats.runningSilence)}
          </Text>
        </View>
      )}

      {/* Frise exponentielle : la dernière minute = la moitié droite. */}
      <EpisodeTimeline
        episodes={stats.active}
        sessionStart={session.started_at}
        sessionEnd={null}
        nowMs={now}
        scale="octave"
      />

      {/* ------------------------------------------------- Stats (2 × 2) */}
      <View style={styles.statGrid}>
        <StatCell
          label="VOCAL TOTAL"
          value={formatDuration(stats.vocalSeconds)}
          sub={`${Math.round(100 - stats.calmPercent)}%`}
        />
        <StatCell
          label="VOL MOYEN"
          value={formatVolume(stats.avgRms)?.replace('VOL ', '') ?? '—'}
          sub={stats.avgRms != null ? stats.avgRms.toFixed(3) : undefined}
        />
        <StatCell label="SILENCE MAX" value={formatDuration(stats.maxSilence)} />
        <StatCell label="SILENCE MOYEN" value={formatDuration(stats.avgSilence)} />
      </View>

      {/* -------------------------- Les 5 derniers épisodes, avec clip */}
      {lastFive.map((episode) => (
        <EpisodeRow key={episode.id} episode={episode} />
      ))}
      {stats.active.length > 0 ? (
        <Pressable onPress={onOpenDetail} hitSlop={6} style={styles.seeAll}>
          <Text style={[styles.seeAllText, { color: colors.accent }]}>
            VOIR TOUT ({stats.active.length}) →
          </Text>
        </Pressable>
      ) : (
        <Text style={[styles.noEpisode, { color: colors.textSecondary }]}>
          AUCUNE VOCALISE POUR L&apos;INSTANT 🎉
        </Text>
      )}

      {/* ------------------------------------ Saisie rapide + TERMINER */}
      <View style={styles.quickRow}>
        <QuickChip label="😢" onPress={onLogWhine} />
        {/* Les deux marques de soulagement : assis et couché. */}
        <QuickChip label="🐩" onPress={() => onLogObservation('sit')} />
        <QuickChip label="🛏" onPress={() => onLogObservation('down')} />
        <QuickChip label="😰" onPress={() => onLogObservation('panic')} />
        <Pressable
          onPress={onStop}
          style={[styles.stopChip, { backgroundColor: colors.danger, borderColor: colors.border }]}>
          <Text style={[styles.stopChipText, { color: colors.accentText }]}>TERMINER</Text>
        </Pressable>
      </View>
      {lastQuickLog ? (
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{lastQuickLog}</Text>
      ) : null}
    </Animated.View>
  );
}

function StatCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const colors = useTheme();
  return (
    <View
      style={[styles.statCell, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>
        {value.toUpperCase()}
        {sub ? <Text style={[styles.statSub, { color: colors.textSecondary }]}> · {sub}</Text> : null}
      </Text>
    </View>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickChip,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <Text style={styles.quickChipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Panneau ancré en haut de l'écran (le `top` exact dépend des insets).
  panel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.md,
    paddingBottom: Spacing.md + 2,
    gap: 8,
    zIndex: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    fontSize: 9,
    flexShrink: 1,
  },
  chrono: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    fontSize: 7,
    lineHeight: 12,
  },
  silenceBox: {
    borderWidth: 2,
    borderRadius: 2,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 6,
  },
  silenceLabel: {
    fontSize: 7,
  },
  silenceValue: {
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  ongoingValue: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  silenceSub: {
    fontSize: 6.5,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statCell: {
    flexBasis: '48%',
    flexGrow: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 4,
  },
  statLabel: {
    fontSize: 6,
  },
  statValue: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  statSub: {
    fontSize: 7,
  },
  seeAll: {
    alignSelf: 'center',
    paddingVertical: 2,
  },
  seeAllText: {
    fontSize: 8,
  },
  noEpisode: {
    fontSize: 7,
    lineHeight: 11,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  // Hauteur FIXE et contenu centré : les emojis ne débordent plus des chips.
  quickChip: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipText: {
    fontSize: 13,
    lineHeight: 18,
  },
  stopChip: {
    marginLeft: 'auto',
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopChipText: {
    fontSize: 8,
  },
});
