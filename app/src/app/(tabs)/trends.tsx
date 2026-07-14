import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { BarChart, ChartCaption, LineChart, type ChartPoint } from '@/components/charts';
import { Card, EmptyState, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, parisHour, parisWeekKey, PARIS_TZ } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { SessionSummary } from '@/lib/types';

export default function TrendsScreen() {
  const colors = useTheme();
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('session_summaries')
      .select('*')
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: true })
      .limit(500);
    if (error) console.warn('Chargement des tendances impossible :', error.message);
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

  // Weekly average of vocal seconds per session (last 8 weeks with data).
  const weeklyVocal: ChartPoint[] = useMemo(() => {
    const byWeek = new Map<string, { total: number; count: number }>();
    for (const s of summaries) {
      const key = parisWeekKey(s.started_at);
      const entry = byWeek.get(key) ?? { total: 0, count: 0 };
      entry.total += s.total_vocal_seconds;
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

  // Morning (before 12h Paris) vs evening sessions: average vocal seconds.
  const morningVsEvening: ChartPoint[] = useMemo(() => {
    const buckets = { morning: { total: 0, count: 0 }, evening: { total: 0, count: 0 } };
    for (const s of summaries) {
      const bucket = parisHour(s.started_at) < 12 ? buckets.morning : buckets.evening;
      bucket.total += s.total_vocal_seconds;
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
          <Card>
            <SectionTitle>Vocalises par session — moyenne hebdo</SectionTitle>
            {weeklyVocal.length > 0 ? (
              <>
                <BarChart data={weeklyVocal} formatValue={(v) => formatDuration(v)} />
                <ChartCaption>
                  Temps vocalisé moyen par session, regroupé par semaine (S = numéro de semaine).
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
              formatValue={(v) => formatDuration(v)}
              color={colors.howl}
            />
            <ChartCaption>
              Temps vocalisé moyen par session selon l’heure de départ (heure de Paris, avant/après
              midi).
            </ChartCaption>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
    flexGrow: 1,
    paddingBottom: 112,
  },
});
