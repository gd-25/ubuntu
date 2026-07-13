import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EpisodeTimeline } from '@/components/episode-timeline';
import { StatCard } from '@/components/stat-card';
import { StatusBadge, type AgentDisplayStatus } from '@/components/status-badge';
import { Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  episodeDurationSeconds,
  formatChrono,
  formatDuration,
  formatTime,
  KIND_LABELS,
  secondsSince,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { AgentHeartbeat, Session, SessionSummary, VocalEpisode } from '@/lib/types';
import { useDog } from '@/lib/use-dog';

/** Agent considered online if last heartbeat is fresher than 2 minutes. */
const HEARTBEAT_FRESH_SECONDS = 120;
/** An episode whose ended_at is within this window counts as "ongoing". */
const ONGOING_EPISODE_SECONDS = 5;

export default function HomeScreen() {
  const colors = useTheme();
  const { dog, isLoading: isDogLoading } = useDog();

  const [lastHeartbeat, setLastHeartbeat] = useState<AgentHeartbeat | null>(null);
  const [lastEpisode, setLastEpisode] = useState<VocalEpisode | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [sessionEpisodes, setSessionEpisodes] = useState<VocalEpisode[]>([]);
  const [recap, setRecap] = useState<SessionSummary | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 1-second ticker for "depuis X" texts and the chrono.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    if (!dog) return;

    const [heartbeatRes, episodeRes, sessionRes] = await Promise.all([
      supabase
        .from('agent_heartbeats')
        .select('*')
        .eq('dog_id', dog.id)
        .order('at', { ascending: false })
        .limit(1),
      supabase
        .from('vocal_episodes')
        .select('*')
        .eq('dog_id', dog.id)
        .order('ended_at', { ascending: false })
        .limit(1),
      supabase
        .from('sessions')
        .select('*')
        .eq('dog_id', dog.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
    ]);

    setLastHeartbeat((heartbeatRes.data?.[0] as AgentHeartbeat | undefined) ?? null);
    setLastEpisode((episodeRes.data?.[0] as VocalEpisode | undefined) ?? null);

    const session = (sessionRes.data?.[0] as Session | undefined) ?? null;
    setActiveSession(session);
    if (!session) {
      setSessionEpisodes([]);
      return;
    }
    const { data: episodes } = await supabase
      .from('vocal_episodes')
      .select('*')
      .eq('session_id', session.id)
      .order('started_at', { ascending: true });
    setSessionEpisodes((episodes as VocalEpisode[] | null) ?? []);
  }, [dog]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime: new episodes and heartbeats for this dog.
  useEffect(() => {
    if (!dog) return;

    const channel = supabase
      .channel(`live-${dog.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vocal_episodes', filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          const episode = payload.new as VocalEpisode;
          setLastEpisode((prev) => {
            if (!prev) return episode;
            return new Date(episode.ended_at) >= new Date(prev.ended_at) ? episode : prev;
          });
          setSessionEpisodes((prev) => {
            if (prev.some((e) => e.id === episode.id)) return prev;
            return [...prev, episode];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vocal_episodes', filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          const episode = payload.new as VocalEpisode;
          setLastEpisode((prev) => (prev && prev.id === episode.id ? episode : prev));
          setSessionEpisodes((prev) => prev.map((e) => (e.id === episode.id ? episode : e)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_heartbeats', filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          setLastHeartbeat(payload.new as AgentHeartbeat);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dog]);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, [loadData]);

  // --- Derived state ---

  const agentStatus: AgentDisplayStatus = useMemo(() => {
    if (!lastHeartbeat) return 'unknown';
    if (secondsSince(lastHeartbeat.at, now) > HEARTBEAT_FRESH_SECONDS) return 'stale';
    return lastHeartbeat.status;
  }, [lastHeartbeat, now]);

  const isVocalizing =
    !!lastEpisode && secondsSince(lastEpisode.ended_at, now) <= ONGOING_EPISODE_SECONDS;

  const currentSessionEpisodes = useMemo(
    () => sessionEpisodes.filter((e) => !activeSession || e.session_id === activeSession.id),
    [sessionEpisodes, activeSession]
  );

  const totalVocalSeconds = useMemo(
    () =>
      currentSessionEpisodes.reduce(
        (sum, e) => sum + episodeDurationSeconds(e.started_at, e.ended_at),
        0
      ),
    [currentSessionEpisodes]
  );

  // --- Actions ---

  const startSession = async () => {
    if (!dog) return;
    setIsBusy(true);
    setRecap(null);
    const { data, error } = await supabase
      .from('sessions')
      .insert({ dog_id: dog.id, trigger: 'manual', started_at: new Date().toISOString() })
      .select()
      .single();
    setIsBusy(false);
    if (error) {
      Alert.alert('Erreur', `Impossible de démarrer la session : ${error.message}`);
      return;
    }
    setActiveSession(data as Session);
    setSessionEpisodes([]);
  };

  const stopSession = async () => {
    if (!activeSession) return;
    setIsBusy(true);
    const { error } = await supabase.functions.invoke('close-session', {
      body: { session_id: activeSession.id },
    });
    if (error) {
      setIsBusy(false);
      Alert.alert('Erreur', `Impossible de clôturer la session : ${error.message}`);
      return;
    }
    const { data: summary } = await supabase
      .from('session_summaries')
      .select('*')
      .eq('session_id', activeSession.id)
      .maybeSingle();
    setRecap((summary as SessionSummary | null) ?? null);
    setActiveSession(null);
    setSessionEpisodes([]);
    setIsBusy(false);
  };

  // --- Render ---

  const renderDogState = () => {
    if (isVocalizing && lastEpisode) {
      const sinceSeconds = secondsSince(lastEpisode.started_at, now);
      return (
        <View>
          <Text style={[styles.dogState, { color: colors.text }]}>
            🔊 Vocalise depuis {formatDuration(sinceSeconds)}
          </Text>
          <Text style={[styles.dogStateDetail, { color: colors.textSecondary }]}>
            {KIND_LABELS[lastEpisode.kind]} — confiance{' '}
            {Math.round(lastEpisode.peak_confidence * 100)} %
          </Text>
        </View>
      );
    }

    const calmSince = lastEpisode?.ended_at ?? activeSession?.started_at ?? null;
    if (!calmSince) {
      return <Text style={[styles.dogState, { color: colors.text }]}>😌 Calme</Text>;
    }
    return (
      <Text style={[styles.dogState, { color: colors.text }]}>
        😌 Calme depuis {formatDuration(secondsSince(calmSince, now))}
      </Text>
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
      <View style={styles.headerRow}>
        <Text style={[styles.dogName, { color: colors.text }]}>
          {dog ? dog.name : 'UBUNTU'}
        </Text>
        <StatusBadge status={agentStatus} />
      </View>

      {!isDogLoading && !dog ? (
        <Card>
          <EmptyState
            title="Bienvenue sur UBUNTU 🐶"
            subtitle="Commencez par créer le profil de votre chien dans l’onglet Réglages."
          />
        </Card>
      ) : (
        <>
          <Card>{renderDogState()}</Card>

          {activeSession ? (
            <Card>
              <SectionTitle>Session en cours</SectionTitle>
              <Text style={[styles.chrono, { color: colors.text }]}>
                {formatChrono(secondsSince(activeSession.started_at, now))}
              </Text>
              <Text style={[styles.chronoCaption, { color: colors.textSecondary }]}>
                Départ à {formatTime(activeSession.started_at)} · Temps vocalisé :{' '}
                {formatDuration(totalVocalSeconds)} · {currentSessionEpisodes.length} épisode
                {currentSessionEpisodes.length > 1 ? 's' : ''}
              </Text>
              <EpisodeTimeline
                episodes={currentSessionEpisodes}
                sessionStart={activeSession.started_at}
                sessionEnd={null}
                nowMs={now}
              />
              {currentSessionEpisodes.length === 0 ? (
                <Text style={[styles.chronoCaption, { color: colors.textSecondary }]}>
                  Aucune vocalise pour l’instant. Tout va bien. 😌
                </Text>
              ) : (
                <View style={styles.episodeList}>
                  {[...currentSessionEpisodes]
                    .slice(-5)
                    .reverse()
                    .map((episode) => (
                      <View key={episode.id} style={styles.episodeRow}>
                        <View style={[styles.episodeDot, { backgroundColor: colors[episode.kind] }]} />
                        <Text style={[styles.episodeText, { color: colors.text }]}>
                          {formatTime(episode.started_at)} · {KIND_LABELS[episode.kind]} ·{' '}
                          {formatDuration(episodeDurationSeconds(episode.started_at, episode.ended_at))}
                        </Text>
                      </View>
                    ))}
                </View>
              )}
              <Button
                label="Arrêter la session"
                variant="danger"
                onPress={stopSession}
                loading={isBusy}
              />
            </Card>
          ) : (
            <Button
              label="Démarrer une session"
              onPress={startSession}
              disabled={!dog}
              loading={isBusy}
            />
          )}

          {recap ? (
            <Card>
              <SectionTitle>Récap de la session</SectionTitle>
              <View style={styles.statGrid}>
                <StatCard
                  label="Durée totale"
                  value={
                    recap.ended_at
                      ? formatDuration(
                          (new Date(recap.ended_at).getTime() -
                            new Date(recap.started_at).getTime()) /
                            1000
                        )
                      : '—'
                  }
                />
                <StatCard label="Temps vocalisé" value={formatDuration(recap.total_vocal_seconds)} />
                <StatCard label="Épisodes" value={String(recap.episode_count)} />
                <StatCard label="% calme" value={`${Math.round(recap.calm_percent)} %`} />
              </View>
              <Link href={{ pathname: '/session/[id]', params: { id: recap.session_id } }} asChild>
                <Text style={[styles.link, { color: colors.accent }]}>Voir le détail →</Text>
              </Link>
              <Button label="Fermer le récap" variant="secondary" onPress={() => setRecap(null)} />
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Dernière activité</SectionTitle>
            {lastEpisode ? (
              <Text style={[styles.episodeText, { color: colors.text }]}>
                {KIND_LABELS[lastEpisode.kind]} à {formatTime(lastEpisode.started_at)} (
                {formatDuration(
                  episodeDurationSeconds(lastEpisode.started_at, lastEpisode.ended_at)
                )}
                )
              </Text>
            ) : (
              <Text style={[styles.episodeText, { color: colors.textSecondary }]}>
                Aucune vocalise enregistrée pour le moment.
              </Text>
            )}
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dogName: {
    fontSize: 24,
    fontWeight: '800',
    flexShrink: 1,
  },
  dogState: {
    fontSize: 22,
    fontWeight: '700',
  },
  dogStateDetail: {
    fontSize: 13,
    marginTop: 4,
  },
  chrono: {
    fontSize: 40,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  chronoCaption: {
    fontSize: 13,
  },
  episodeList: {
    gap: 6,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  episodeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  episodeText: {
    fontSize: 14,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  link: {
    fontSize: 15,
    fontWeight: '600',
  },
});
