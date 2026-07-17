import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { EpisodeTimeline } from '@/components/episode-timeline';
import { ScreenTitle } from '@/components/screen-title';
import { Text } from '@/components/text';
import { StatCard } from '@/components/stat-card';
import { StatusBadge, type AgentDisplayStatus } from '@/components/status-badge';
import { Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ACTIVITY_LABELS,
  episodeDurationSeconds,
  formatChrono,
  formatDateTime,
  formatDuration,
  formatTime,
  KIND_LABELS,
  OBSERVED_LABELS,
  secondsSince,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type {
  Activity,
  AgentHeartbeat,
  ObservedKind,
  Session,
  SessionSummary,
  VocalEpisode,
} from '@/lib/types';
import { useDog } from '@/lib/use-dog';

/** Agent considered online if last heartbeat is fresher than 2 minutes. */
const HEARTBEAT_FRESH_SECONDS = 120;
/** An episode whose ended_at is within this window counts as "ongoing". */
const ONGOING_EPISODE_SECONDS = 5;

export default function HomeScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { dog, isLoading: isDogLoading } = useDog();

  const [lastHeartbeat, setLastHeartbeat] = useState<AgentHeartbeat | null>(null);
  const [lastEpisode, setLastEpisode] = useState<VocalEpisode | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [sessionEpisodes, setSessionEpisodes] = useState<VocalEpisode[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [lastQuickLog, setLastQuickLog] = useState<string | null>(null);
  const [recap, setRecap] = useState<SessionSummary | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // 1-second ticker for "depuis X" texts and the chrono.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = useCallback(async () => {
    if (!dog) return null;

    const [heartbeatRes, episodeRes, sessionRes, activitiesRes] = await Promise.all([
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
      supabase
        .from('activities')
        .select('*')
        .eq('dog_id', dog.id)
        .order('at', { ascending: false })
        .limit(3),
    ]);

    const firstError = heartbeatRes.error ?? episodeRes.error ?? sessionRes.error;
    if (firstError) console.warn('Chargement du direct incomplet :', firstError.message);

    const session = (sessionRes.data?.[0] as Session | undefined) ?? null;
    let sessionEpisodeRows: VocalEpisode[] = [];
    if (session) {
      const { data: episodes } = await supabase
        .from('vocal_episodes')
        .select('*')
        .eq('session_id', session.id)
        .order('started_at', { ascending: true });
      sessionEpisodeRows = (episodes as VocalEpisode[] | null) ?? [];
    }

    return {
      heartbeat: (heartbeatRes.data?.[0] as AgentHeartbeat | undefined) ?? null,
      episode: (episodeRes.data?.[0] as VocalEpisode | undefined) ?? null,
      session,
      sessionEpisodes: sessionEpisodeRows,
      activities: (activitiesRes.data as Activity[] | null) ?? [],
    };
  }, [dog]);

  const loadData = useCallback(async () => {
    const snapshot = await fetchData();
    if (!snapshot) return;
    setLastHeartbeat(snapshot.heartbeat);
    setLastEpisode(snapshot.episode);
    setActiveSession(snapshot.session);
    setSessionEpisodes(snapshot.sessionEpisodes);
    setRecentActivities(snapshot.activities);
  }, [fetchData]);

  // Recharge au focus (retour de la feuille « Enregistrer une activité », etc.).
  useFocusEffect(
    useCallback(() => {
      let ignore = false;
      fetchData().then((snapshot) => {
        if (ignore || !snapshot) return;
        setLastHeartbeat(snapshot.heartbeat);
        setLastEpisode(snapshot.episode);
        setActiveSession(snapshot.session);
        setSessionEpisodes(snapshot.sessionEpisodes);
        setRecentActivities(snapshot.activities);
      });
      return () => {
        ignore = true;
      };
    }, [fetchData])
  );

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

  // Signalement rapide pendant la session : couinement entendu (→ épisode
  // manuel de 5 s qui compte dans les stats) ou observation comportementale.
  const logManualWhine = async () => {
    if (!dog || !activeSession) return;
    const now = new Date();
    const { error } = await supabase.from('vocal_episodes').insert({
      dog_id: dog.id,
      session_id: activeSession.id,
      started_at: new Date(now.getTime() - 5000).toISOString(),
      ended_at: now.toISOString(),
      kind: 'whine',
      source: 'manual',
    });
    if (error) {
      Alert.alert('Erreur', `Impossible d'enregistrer : ${error.message}`);
      return;
    }
    setLastQuickLog(`😢 Couinement noté à ${formatTime(now.toISOString())}`);
  };

  const logObservation = async (kind: ObservedKind) => {
    if (!dog || !activeSession) return;
    const at = new Date().toISOString();
    const { error } = await supabase
      .from('observed_events')
      .insert({ dog_id: dog.id, session_id: activeSession.id, kind, at });
    if (error) {
      Alert.alert('Erreur', `Impossible d'enregistrer : ${error.message}`);
      return;
    }
    setLastQuickLog(`${OBSERVED_LABELS[kind]} noté à ${formatTime(at)}`);
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
            {KIND_LABELS[lastEpisode.kind]}
            {lastEpisode.peak_confidence !== null
              ? ` — confiance ${Math.round(lastEpisode.peak_confidence * 100)} %`
              : ' — signalé manuellement'}
          </Text>
        </View>
      );
    }

    // « Calme depuis X » n'a de sens que pendant une session.
    if (!activeSession) {
      return (
        <View>
          <Text style={[styles.dogState, { color: colors.text }]}>Aucune session en cours</Text>
          <Text style={[styles.dogStateDetail, { color: colors.textSecondary }]}>
            Démarrez une session quand vous laissez {dog?.name ?? 'votre chien'} seul.
          </Text>
        </View>
      );
    }

    const sessionEnd = sessionEpisodes.filter((e) => e.session_id === activeSession.id).at(-1);
    const calmSince = sessionEnd?.ended_at ?? activeSession.started_at;
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
      <ScreenTitle
        title="Direct"
        subtitle={dog?.name}
        right={<StatusBadge status={agentStatus} />}
      />

      {!isDogLoading && !dog ? (
        <Card>
          <EmptyState
            title="Bienvenue sur UBUNTU"
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
                  Aucune vocalise pour l’instant. Tout va bien.
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
              <View style={styles.quickLogRow}>
                <QuickLogChip label="😢 Couinement" onPress={logManualWhine} />
                <QuickLogChip label="😌 Soulagement" onPress={() => logObservation('relief')} />
                <QuickLogChip label="😰 Panique" onPress={() => logObservation('panic')} />
              </View>
              {lastQuickLog ? (
                <Text style={[styles.chronoCaption, { color: colors.textSecondary }]}>
                  {lastQuickLog}
                </Text>
              ) : null}
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

          <Button
            label="Enregistrer une activité"
            variant="secondary"
            onPress={() => router.push('/activity-log')}
            disabled={!dog}
          />

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
                {/* Link asChild (Slot) rejects style arrays — pass a flattened object. */}
                <Text style={StyleSheet.flatten([styles.link, { color: colors.accent }])}>
                  Voir le détail →
                </Text>
              </Link>
              <Button label="Fermer le récap" variant="secondary" onPress={() => setRecap(null)} />
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Dernière vocalise</SectionTitle>
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

          {recentActivities.length > 0 ? (
            <Card>
              <SectionTitle>Activités récentes</SectionTitle>
              {recentActivities.map((activity) => (
                <View key={activity.id} style={styles.episodeRow}>
                  <Text style={[styles.episodeText, { color: colors.text }]}>
                    {ACTIVITY_LABELS[activity.kind]} · {formatDateTime(activity.at)}
                    {activity.notes ? ` · ${activity.notes}` : ''}
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/** Petit bouton de signalement rapide pendant la session. */
function QuickLogChip({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickLogChip,
        { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Text style={[styles.quickLogChipText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
    paddingBottom: 112,
  },
  quickLogRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  quickLogChip: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickLogChipText: {
    fontSize: 14,
    fontWeight: '600',
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
