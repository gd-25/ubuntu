import { useLocalSearchParams } from 'expo-router';
import { Play } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { openEpisodeClip } from '@/lib/clips';
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
import type { Session, SessionSummary, Tag, VocalEpisode } from '@/lib/types';

export default function SessionDetailScreen() {
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [episodes, setEpisodes] = useState<VocalEpisode[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // Static "now" for the timeline right edge when viewing an ongoing session.
  const [nowMs] = useState(() => Date.now());

  const fetchDetail = useCallback(async () => {
    if (!id) return null;
    const [sessionRes, summaryRes, episodesRes, sessionTagsRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).maybeSingle(),
      supabase.from('session_summaries').select('*').eq('session_id', id).maybeSingle(),
      supabase
        .from('vocal_episodes')
        .select('*')
        .eq('session_id', id)
        .order('started_at', { ascending: true }),
      supabase.from('session_tags').select('tag_id').eq('session_id', id),
    ]);
    const firstError = sessionRes.error ?? summaryRes.error ?? episodesRes.error;
    if (firstError) console.warn('Chargement de la session incomplet :', firstError.message);

    const session = sessionRes.data as Session | null;
    let tagRows: Tag[] = [];
    if (session) {
      const { data } = await supabase
        .from('tags')
        .select('*')
        .eq('dog_id', session.dog_id)
        .order('created_at', { ascending: true });
      tagRows = (data as Tag[] | null) ?? [];
    }
    return {
      session,
      summary: summaryRes.data as SessionSummary | null,
      episodes: (episodesRes.data as VocalEpisode[] | null) ?? [],
      tags: tagRows,
      selectedTagIds: new Set(
        ((sessionTagsRes.data as { tag_id: string }[] | null) ?? []).map((t) => t.tag_id)
      ),
    };
  }, [id]);

  useEffect(() => {
    let ignore = false;
    fetchDetail().then((detail) => {
      if (ignore || !detail) return;
      setSession(detail.session);
      setNotes(detail.session?.notes ?? '');
      setSummary(detail.summary);
      setEpisodes(detail.episodes);
      setTags(detail.tags);
      setSelectedTagIds(detail.selectedTagIds);
      setIsLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [fetchDetail]);

  const toggleTag = async (tag: Tag) => {
    if (!session) return;
    const isSelected = selectedTagIds.has(tag.id);
    // Optimiste : on met à jour l'UI puis on annule si la requête échoue.
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (isSelected) next.delete(tag.id);
      else next.add(tag.id);
      return next;
    });
    const { error } = isSelected
      ? await supabase
          .from('session_tags')
          .delete()
          .eq('session_id', session.id)
          .eq('tag_id', tag.id)
      : await supabase.from('session_tags').insert({ session_id: session.id, tag_id: tag.id });
    if (error) {
      setSelectedTagIds((prev) => {
        const next = new Set(prev);
        if (isSelected) next.add(tag.id);
        else next.delete(tag.id);
        return next;
      });
      Alert.alert('Erreur', `Impossible de modifier la particularité : ${error.message}`);
    }
  };

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
            Aucune vocalise pendant cette session.
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
              {episode.clip_path ? (
                <ClipButton clipPath={episode.clip_path} />
              ) : null}
            </View>
          ))
        )}
      </Card>

      <Card>
        <SectionTitle>Particularités</SectionTitle>
        {tags.length === 0 ? (
          <Text style={[styles.episodeText, { color: colors.textSecondary }]}>
            Aucune particularité définie. Ajoutez-en dans l&apos;onglet Réglages.
          </Text>
        ) : (
          <View style={styles.tagRow}>
            {tags.map((tag) => {
              const selected = selectedTagIds.has(tag.id);
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => toggleTag(tag)}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: selected ? colors.accent : colors.background,
                      borderColor: selected ? colors.accent : colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.tagChipText,
                      { color: selected ? colors.accentText : colors.text },
                    ]}>
                    {tag.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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

/** Bouton « voir le clip vidéo » d'un épisode. */
function ClipButton({ clipPath }: { clipPath: string }) {
  const colors = useTheme();
  const [isOpening, setIsOpening] = useState(false);

  const open = async () => {
    setIsOpening(true);
    try {
      await openEpisodeClip(clipPath);
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Clip indisponible.');
    } finally {
      setIsOpening(false);
    }
  };

  return (
    <Pressable
      onPress={open}
      disabled={isOpening}
      hitSlop={8}
      style={({ pressed }) => [
        styles.clipButton,
        { backgroundColor: colors.accent, opacity: pressed || isOpening ? 0.6 : 1 },
      ]}>
      {isOpening ? (
        <ActivityIndicator size="small" color={colors.accentText} />
      ) : (
        <Play size={12} color={colors.accentText} fill={colors.accentText} />
      )}
      <Text style={[styles.clipButtonText, { color: colors.accentText }]}>Clip</Text>
    </Pressable>
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
    flex: 1,
  },
  clipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  clipButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tagChipText: {
    fontSize: 14,
    fontWeight: '600',
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
