import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { BarChart, ChartCaption, LineChart, type ChartPoint } from '@/components/charts';
import type { Participant } from '@/components/home/solo-picker';
import { ScreenTitle } from '@/components/screen-title';
import { Text } from '@/components/text';
import { Card, EmptyState, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, parisDayKey, parisHour, parisWeekKey, PARIS_TZ } from '@/lib/format';
import { DEFAULT_GOALS, fetchGoals, type Goals } from '@/lib/goals';
import { supabase } from '@/lib/supabase';
import type { SessionSummary } from '@/lib/types';
import { useDog } from '@/lib/use-dog';

/** Seuil de « session réussie » pour les records à battre. */
const RECORD_CALM_PERCENT = 95;

/** Les trois configurations de départ dont on garde un record. */
type RecordKey = 'fiona' | 'greg' | 'duo';

const RECORD_DEFS: { key: RecordKey; label: string; people: Participant[] }[] = [
  { key: 'fiona', label: 'FIONA', people: ['fiona'] },
  { key: 'greg', label: 'GREG', people: ['greg'] },
  { key: 'duo', label: 'À DEUX', people: ['fiona', 'greg'] },
];

const AVATARS: Record<Participant, { source: number; w: number; h: number }> = {
  greg: { source: require('../../../assets/images/avatars/greg.png'), w: 18, h: 25 },
  fiona: { source: require('../../../assets/images/avatars/fio.png'), w: 20, h: 27 },
};

interface SessionRecord {
  seconds: number;
  startedAt: string;
  calmPercent: number;
}

/** Part de temps vocalisé d'une session, en % de sa durée. */
function vocalPercent(summary: SessionSummary): number | null {
  if (!summary.ended_at) return null;
  const seconds =
    (new Date(summary.ended_at).getTime() - new Date(summary.started_at).getTime()) / 1000;
  if (seconds <= 0) return null;
  return Math.min(100, (summary.total_vocal_seconds / seconds) * 100);
}

export default function TrendsScreen() {
  const colors = useTheme();
  const { dog } = useDog();
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  /** Participants par session (absents de la vue session_summaries). */
  const [participantsById, setParticipantsById] = useState<Record<string, Participant[]>>({});
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [summariesRes, sessionsRes] = await Promise.all([
      supabase
        .from('session_summaries')
        .select('*')
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: true })
        .limit(500),
      supabase.from('sessions').select('id, participants').limit(500),
    ]);
    if (summariesRes.error)
      console.warn('Chargement des tendances impossible :', summariesRes.error.message);
    setSummaries((summariesRes.data as SessionSummary[] | null) ?? []);
    const byId: Record<string, Participant[]> = {};
    for (const row of (sessionsRes.data as { id: string; participants: Participant[] }[] | null) ??
      []) {
      byId[row.id] = row.participants ?? [];
    }
    setParticipantsById(byId);
    setIsLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      // Objectifs quotidiens (paramétrables dans Réglages).
      if (dog) fetchGoals(dog.id).then(setGoals);
    }, [load, dog])
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  }, [load]);

  // Records à battre : la plus longue session à plus de 95 % de calme,
  // pour chaque configuration de départ (Fiona seule, Greg seul, à deux).
  const records = useMemo(() => {
    const best: Record<RecordKey, SessionRecord | null> = { fiona: null, greg: null, duo: null };
    for (const s of summaries) {
      if (!s.ended_at || s.calm_percent < RECORD_CALM_PERCENT) continue;
      const people = participantsById[s.session_id];
      if (!people || people.length === 0) continue;
      const key: RecordKey =
        people.includes('greg') && people.includes('fiona')
          ? 'duo'
          : people.includes('greg')
            ? 'greg'
            : 'fiona';
      const seconds =
        (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000;
      const current = best[key];
      if (!current || seconds > current.seconds) {
        best[key] = { seconds, startedAt: s.started_at, calmPercent: s.calm_percent };
      }
    }
    return best;
  }, [summaries, participantsById]);

  // Minutes de solitude (sessions SOLO, pas semi solo) par jour —
  // les 14 derniers jours avec au moins une session.
  const dailySoloMinutes: ChartPoint[] = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of summaries) {
      if (!s.ended_at) continue;
      const key = parisDayKey(s.started_at);
      const minutes =
        (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60_000;
      byDay.set(key, (byDay.get(key) ?? 0) + minutes);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([key, minutes]) => ({
        // key = AAAA-MM-JJ → libellé JJ/MM.
        label: `${key.slice(8, 10)}/${key.slice(5, 7)}`,
        value: Math.round(minutes),
      }));
  }, [summaries]);

  // Part de temps vocalisé (% de la durée de session), moyenne hebdo
  // (8 dernières semaines avec des données).
  const weeklyVocal: ChartPoint[] = useMemo(() => {
    const byWeek = new Map<string, { total: number; count: number }>();
    for (const s of summaries) {
      const percent = vocalPercent(s);
      if (percent === null) continue;
      const key = parisWeekKey(s.started_at);
      const entry = byWeek.get(key) ?? { total: 0, count: 0 };
      entry.total += percent;
      entry.count += 1;
      byWeek.set(key, entry);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([key, { total, count }]) => ({
        label: key.split('-')[1],
        value: Math.round(total / count),
      }));
  }, [summaries]);

  // Time to first vocalization, per session over time (last 20 sessions with a vocalization).
  const firstVocalization: ChartPoint[] = useMemo(() => {
    return summaries
      .filter((s) => s.time_to_first_vocalization_seconds !== null)
      .slice(-20)
      .map((s) => ({
        label: new Date(s.started_at).toLocaleDateString('fr-FR', {
          timeZone: PARIS_TZ,
          day: '2-digit',
          month: '2-digit',
        }),
        value: Math.round(s.time_to_first_vocalization_seconds ?? 0),
      }));
  }, [summaries]);

  // Matin (avant 12 h Paris) vs après-midi/soir : part de temps vocalisé.
  const morningVsEvening: ChartPoint[] = useMemo(() => {
    const buckets = { morning: { total: 0, count: 0 }, evening: { total: 0, count: 0 } };
    for (const s of summaries) {
      const percent = vocalPercent(s);
      if (percent === null) continue;
      const bucket = parisHour(s.started_at) < 12 ? buckets.morning : buckets.evening;
      bucket.total += percent;
      bucket.count += 1;
    }
    const avg = (b: { total: number; count: number }) =>
      b.count === 0 ? 0 : Math.round(b.total / b.count);
    return [
      { label: `Matin (${buckets.morning.count})`, value: avg(buckets.morning) },
      { label: `Après-midi/soir (${buckets.evening.count})`, value: avg(buckets.evening) },
    ];
  }, [summaries]);

  const hasData = summaries.length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Titre fixe, même composant que le Journal. */}
      <View style={styles.titleWrap}>
        <ScreenTitle title="STATS" />
      </View>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
      {!hasData && !isLoading ? (
        <EmptyState
          title="Pas encore de tendances"
          subtitle="Terminez quelques sessions pour voir apparaître les graphiques."
        />
      ) : (
        <>
          {/* Les records, tout en haut : la plus longue absence réussie. */}
          <Card>
            <SectionTitle>Record à battre !</SectionTitle>
            <View style={styles.recordRow}>
              {RECORD_DEFS.map(({ key, label, people }) => (
                <RecordBox
                  key={key}
                  label={label}
                  people={people}
                  record={records[key]}
                />
              ))}
            </View>
            <ChartCaption>
              {`La plus longue session à plus de ${RECORD_CALM_PERCENT} % de calme, selon qui a laissé Ubuntu seul.`}
            </ChartCaption>
          </Card>

          <Card>
            <SectionTitle>Minutes solo par jour</SectionTitle>
            {dailySoloMinutes.length > 0 ? (
              <>
                <BarChart
                  data={dailySoloMinutes}
                  formatValue={(v) => `${v}`}
                  color={colors.success}
                  verticalLabels
                />
                <ChartCaption>
                  {`Minutes passées seul (sessions SOLO, pas semi solo) par jour — objectif ${goals.soloMinutes} min par jour.`}
                </ChartCaption>
              </>
            ) : (
              <ChartCaption>Pas encore de session terminée.</ChartCaption>
            )}
          </Card>

          <Card>
            <SectionTitle>Temps vocalisé — moyenne hebdo</SectionTitle>
            {weeklyVocal.length > 0 ? (
              <>
                <BarChart data={weeklyVocal} formatValue={(v) => `${v} %`} />
                <ChartCaption>
                  Part de la session pendant laquelle Ubuntu vocalise, en moyenne, regroupée par
                  semaine (S = numéro de semaine).
                </ChartCaption>
              </>
            ) : (
              <ChartCaption>Pas assez de données.</ChartCaption>
            )}
          </Card>

          <Card>
            <SectionTitle>Délai avant la 1ʳᵉ vocalise</SectionTitle>
            {firstVocalization.length > 0 ? (
              <>
                <LineChart data={firstVocalization} formatValue={(v) => formatDuration(v)} />
                <ChartCaption>
                  Évolution session après session — plus la courbe monte, plus votre chien reste
                  calme longtemps après votre départ.
                </ChartCaption>
              </>
            ) : (
              <ChartCaption>Aucune session avec vocalise pour l’instant.</ChartCaption>
            )}
          </Card>

          <Card>
            <SectionTitle>Matin vs après-midi/soir</SectionTitle>
            <BarChart
              data={morningVsEvening}
              formatValue={(v) => `${v} %`}
              color={colors.howl}
            />
            <ChartCaption>
              Part de la session pendant laquelle Ubuntu vocalise, selon l’heure de départ (heure
              de Paris, avant/après midi).
            </ChartCaption>
          </Card>
        </>
      )}
      </ScrollView>
    </View>
  );
}

/** Une des trois boîtes « record » : qui part, combien de temps, quel jour. */
function RecordBox({
  label,
  people,
  record,
}: {
  label: string;
  people: Participant[];
  record: SessionRecord | null;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.recordBox, { backgroundColor: colors.cardAlt }]}>
      <View style={styles.recordAvatars}>
        {people.map((person) => (
          <Image
            key={person}
            source={AVATARS[person].source}
            style={{ width: AVATARS[person].w, height: AVATARS[person].h }}
            contentFit="contain"
          />
        ))}
      </View>
      <Text style={[styles.recordLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.recordValue, { color: record ? colors.success : colors.textSecondary }]}>
        {record ? formatDuration(record.seconds) : '—'}
      </Text>
      <Text style={[styles.recordDate, { color: colors.textSecondary }]} numberOfLines={1}>
        {record
          ? new Date(record.startedAt).toLocaleDateString('fr-FR', {
              timeZone: PARIS_TZ,
              day: '2-digit',
              month: '2-digit',
            })
          : 'aucun record'}
      </Text>
    </View>
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
    gap: Spacing.md,
    flexGrow: 1,
    paddingBottom: 112,
  },
  recordRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  recordBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  // Deux avatars côte à côte pour « à deux » : hauteur fixe, jamais de saut.
  recordAvatars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    height: 28,
  },
  recordLabel: {
    fontSize: 6.5,
  },
  recordValue: {
    fontSize: 10,
  },
  recordDate: {
    fontSize: 5.5,
  },
});
