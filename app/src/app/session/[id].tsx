import { useLocalSearchParams } from 'expo-router';
import { Play, X } from 'lucide-react-native';
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
  OBSERVED_LABELS,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type {
  EpisodeKind,
  ObservedEvent,
  Session,
  SessionSummary,
  Tag,
  VocalEpisode,
} from '@/lib/types';

export default function SessionDetailScreen() {
  const colors = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [session, setSession] = useState<Session | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [episodes, setEpisodes] = useState<VocalEpisode[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [observedEvents, setObservedEvents] = useState<ObservedEvent[]>([]);
  const [manualKind, setManualKind] = useState<EpisodeKind>('whine');
  const [manualTime, setManualTime] = useState('');
  const [manualDuration, setManualDuration] = useState('10');
  const [isAddingEpisode, setIsAddingEpisode] = useState(false);
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // Static "now" for the timeline right edge when viewing an ongoing session.
  const [nowMs] = useState(() => Date.now());

  const fetchDetail = useCallback(async () => {
    if (!id) return null;
    const [sessionRes, summaryRes, episodesRes, sessionTagsRes, observedRes] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', id).maybeSingle(),
      supabase.from('session_summaries').select('*').eq('session_id', id).maybeSingle(),
      supabase
        .from('vocal_episodes')
        .select('*')
        .eq('session_id', id)
        .order('started_at', { ascending: true }),
      supabase.from('session_tags').select('tag_id').eq('session_id', id),
      supabase
        .from('observed_events')
        .select('*')
        .eq('session_id', id)
        .order('at', { ascending: true }),
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
      observedEvents: (observedRes.data as ObservedEvent[] | null) ?? [],
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
      setObservedEvents(detail.observedEvents);
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

  /** "14:30" → Date sur le jour (local) du début de la session. */
  const parseSessionTime = (value: string): Date | null => {
    if (!session) return null;
    const match = value.trim().match(/^(\d{1,2})[h:](\d{2})$/i);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    const date = new Date(session.started_at);
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const addManualEpisode = async () => {
    if (!session) return;
    const start = parseSessionTime(manualTime);
    const durationSecondsInput = Number(manualDuration);
    if (!start) {
      Alert.alert('Format invalide', 'Entrez l’heure au format 14:30.');
      return;
    }
    if (!Number.isFinite(durationSecondsInput) || durationSecondsInput <= 0) {
      Alert.alert('Durée invalide', 'Entrez une durée en secondes (ex. 10).');
      return;
    }
    setIsAddingEpisode(true);
    const { data, error } = await supabase
      .from('vocal_episodes')
      .insert({
        dog_id: session.dog_id,
        session_id: session.id,
        started_at: start.toISOString(),
        ended_at: new Date(start.getTime() + durationSecondsInput * 1000).toISOString(),
        kind: manualKind,
        source: 'manual',
      })
      .select()
      .single();
    setIsAddingEpisode(false);
    if (error) {
      Alert.alert('Erreur', `Ajout impossible : ${error.message}`);
      return;
    }
    setEpisodes((prev) =>
      [...prev, data as VocalEpisode].sort(
        (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      )
    );
    setManualTime('');
  };

  const deleteManualEpisode = (episode: VocalEpisode) => {
    Alert.alert('Supprimer ?', 'Cet épisode manuel sera retiré des statistiques.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('vocal_episodes').delete().eq('id', episode.id);
          if (error) {
            Alert.alert('Erreur', `Suppression impossible : ${error.message}`);
            return;
          }
          setEpisodes((prev) => prev.filter((e) => e.id !== episode.id));
        },
      },
    ]);
  };

  const deleteObservation = async (event: ObservedEvent) => {
    const { error } = await supabase.from('observed_events').delete().eq('id', event.id);
    if (error) {
      Alert.alert('Erreur', `Suppression impossible : ${error.message}`);
      return;
    }
    setObservedEvents((prev) => prev.filter((e) => e.id !== event.id));
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
                {formatDuration(episodeDurationSeconds(episode.started_at, episode.ended_at))}
                {episode.avg_confidence !== null
                  ? ` · conf. ${Math.round(episode.avg_confidence * 100)} %`
                  : ' · manuel'}
              </Text>
              {episode.clip_path ? (
                <ClipButton clipPath={episode.clip_path} />
              ) : null}
              {episode.source === 'manual' ? (
                <Pressable onPress={() => deleteManualEpisode(episode)} hitSlop={8}>
                  <X size={16} color={colors.danger} />
                </Pressable>
              ) : null}
            </View>
          ))
        )}

        <Text style={[styles.addTitle, { color: colors.textSecondary }]}>
          Ajouter un couinement raté par l&apos;agent :
        </Text>
        <View style={styles.addKindRow}>
          {(['whine', 'bark', 'howl'] as EpisodeKind[]).map((kind) => (
            <Pressable
              key={kind}
              onPress={() => setManualKind(kind)}
              style={[
                styles.tagChip,
                {
                  backgroundColor: manualKind === kind ? colors[kind] : colors.background,
                  borderColor: manualKind === kind ? colors[kind] : colors.border,
                },
              ]}>
              <Text
                style={[
                  styles.tagChipText,
                  { color: manualKind === kind ? '#FFFFFF' : colors.text },
                ]}>
                {KIND_LABELS[kind]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.addFormRow}>
          <TextInput
            style={[
              styles.addInput,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
            placeholder="Heure (14:30)"
            placeholderTextColor={colors.textSecondary}
            value={manualTime}
            onChangeText={setManualTime}
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
          <TextInput
            style={[
              styles.addInput,
              styles.addInputSmall,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
            placeholder="Durée (s)"
            placeholderTextColor={colors.textSecondary}
            value={manualDuration}
            onChangeText={setManualDuration}
            keyboardType="number-pad"
          />
        </View>
        <Button
          label="Ajouter l'épisode"
          variant="secondary"
          onPress={addManualEpisode}
          loading={isAddingEpisode}
          disabled={!manualTime.trim()}
        />
      </Card>

      <Card>
        <SectionTitle>Observations ({observedEvents.length})</SectionTitle>
        {observedEvents.length === 0 ? (
          <Text style={[styles.episodeText, { color: colors.textSecondary }]}>
            Rien de noté pendant cette session (boutons 😌/😰 sur l&apos;écran Direct pendant une
            session).
          </Text>
        ) : (
          observedEvents.map((event) => (
            <View key={event.id} style={styles.episodeRow}>
              <Text style={[styles.episodeText, { color: colors.text }]}>
                {formatTime(event.at)} · {OBSERVED_LABELS[event.kind]}
              </Text>
              <Pressable onPress={() => deleteObservation(event)} hitSlop={8}>
                <X size={16} color={colors.danger} />
              </Pressable>
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
  addTitle: {
    fontSize: 13,
    marginTop: 6,
  },
  addKindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  addFormRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  addInputSmall: {
    flex: 0.6,
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
