import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { EpisodeTimeline } from '@/components/episode-timeline';
import { StatCard } from '@/components/stat-card';
import { Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  episodeDurationSeconds,
  formatDateTime,
  formatDuration,
  formatTime,
  KIND_LABELS,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Session, SessionSummary, VocalEpisode } from '@/lib/types';

export default function SessionDetailScreen() {
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [episodes, setEpisodes] = useState<VocalEpisode[]>([]);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // Static "now" for the timeline right edge when viewing an ongoing session.
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    const [sessionRes, summaryRes, episodesRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).maybeSingle(),
      supabase.from('session_summaries').select('*').eq('session_id', id).maybeSingle(),
      supabase
        .from('vocal_episodes')
        .select('*')
        .eq('session_id', id)
        .order('started_at', { ascending: true }),
    ]);
    const sessionRow = sessionRes.data as Session | null;
    setSession(sessionRow);
    setNotes(sessionRow?.notes ?? '');
    setSummary(summaryRes.data as SessionSummary | null);
    setEpisodes((episodesRes.data as VocalEpisode[] | null) ?? []);
    setIsLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveNotes = async () => {
    if (!session) return;
    setIsSaving(true);
    const { error } = await supabase
      .from('sessions')
      .update({ notes: notes.trim() || null })
      .eq('id', session.id);
    setIsSaving(false);
    if (error) {
      Alert.alert('Erreur', `Impossible d’enregistrer les notes : ${error.message}`);
      return;
    }
    Alert.alert('Enregistré', 'Notes mises à jour.');
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <EmptyState title="Session introuvable" />
      </View>
    );
  }

  const durationSeconds = session.ended_at
    ? (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000
    : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
      <View>
        <Text style={[styles.title, { color: colors.text }]}>
          {formatDateTime(session.started_at)}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {session.trigger === 'manual' ? 'Départ manuel' : 'Départ géolocalisé'}
          {session.ended_at ? ` · terminée à ${formatTime(session.ended_at)}` : ' · en cours'}
        </Text>
      </View>

      <Card>
        <SectionTitle>Chronologie des vocalises</SectionTitle>
        <EpisodeTimeline
          episodes={episodes}
          sessionStart={session.started_at}
          sessionEnd={session.ended_at}
          nowMs={nowMs}
        />
      </Card>

      {summary ? (
        <Card>
          <SectionTitle>Statistiques</SectionTitle>
          <View style={styles.statGrid}>
            <StatCard
              label="Durée totale"
              value={durationSeconds !== null ? formatDuration(durationSeconds) : '—'}
            />
            <StatCard label="Temps vocalisé" value={formatDuration(summary.total_vocal_seconds)} />
            <StatCard label="Épisodes" value={String(summary.episode_count)} />
            <StatCard
              label="Plus long épisode"
              value={formatDuration(summary.longest_episode_seconds)}
            />
            <StatCard
              label="Délai 1ʳᵉ vocalise"
              value={
                summary.time_to_first_vocalization_seconds !== null
                  ? formatDuration(summary.time_to_first_vocalization_seconds)
                  : 'Aucune'
              }
            />
            <StatCard label="% calme" value={`${Math.round(summary.calm_percent)} %`} />
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Épisodes ({episodes.length})</SectionTitle>
        {episodes.length === 0 ? (
          <Text style={[styles.episodeText, { color: colors.textSecondary }]}>
            Aucune vocalise pendant cette session. 🎉
          </Text>
        ) : (
          episodes.map((episode) => (
            <View key={episode.id} style={styles.episodeRow}>
              <View style={[styles.episodeDot, { backgroundColor: colors[episode.kind] }]} />
              <Text style={[styles.episodeText, { color: colors.text }]}>
                {formatTime(episode.started_at)} · {KIND_LABELS[episode.kind]} ·{' '}
                {formatDuration(episodeDurationSeconds(episode.started_at, episode.ended_at))} ·
                conf. {Math.round(episode.avg_confidence * 100)} %
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Notes</SectionTitle>
        <TextInput
          style={[
            styles.notesInput,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
          ]}
          multiline
          placeholder="Ajoutez vos observations (contexte, météo, promenade avant le départ…)"
          placeholderTextColor={colors.textSecondary}
          value={notes}
          onChangeText={setNotes}
        />
        <Button label="Enregistrer les notes" onPress={saveNotes} loading={isSaving} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
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
    flexShrink: 1,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    fontSize: 15,
    textAlignVertical: 'top',
  },
});
