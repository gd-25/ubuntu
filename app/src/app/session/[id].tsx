import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EpisodeTimeline } from '@/components/episode-timeline';
import {
  Chip,
  DialogButtons,
  DialogLabel,
  DialogNotes,
  PixelDialog,
} from '@/components/home/pixel-dialog';
import { Text, TextInput } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openEpisodeClip } from '@/lib/clips';
import {
  episodeDurationSeconds,
  formatDateTime,
  formatDuration,
  formatTime,
  KIND_LABELS,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { EpisodeKind, Session, SessionSummary, Tag, VocalEpisode } from '@/lib/types';

const KINDS: { value: EpisodeKind; label: string }[] = [
  { value: 'whine', label: 'GÉMISSEMENT' },
  { value: 'bark', label: 'ABOIEMENT' },
  { value: 'howl', label: 'HURLEMENT' },
];

const EPISODE_DURATIONS = [
  { seconds: 5, label: '5 S' },
  { seconds: 10, label: '10 S' },
  { seconds: 20, label: '20 S' },
  { seconds: 30, label: '30 S' },
  { seconds: 60, label: '1 MIN' },
  { seconds: 120, label: '2 MIN' },
] as const;

/**
 * Détail d'une session de solitude, en bottom sheet (comme le détail des
 * autres entrées du journal) : chronologie des vocalises, les deux stats
 * utiles (+ la durée), particularités inline et notes. Un bouton discret
 * ouvre la modale d'ajout d'un épisode raté par l'agent.
 */
export default function SessionDetailScreen() {
  const colors = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
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

  // Modale « ajouter un épisode » (même UI que les modales de la Maison).
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [episodeKind, setEpisodeKind] = useState<EpisodeKind>('whine');
  const [episodeTime, setEpisodeTime] = useState<Date>(new Date());
  const [episodeSeconds, setEpisodeSeconds] = useState<number>(10);
  const [isAddingEpisode, setIsAddingEpisode] = useState(false);

  // Modale « nouvelle particularité » (liste éditable aussi dans Réglages).
  const [tagOpen, setTagOpen] = useState(false);
  const [tagLabel, setTagLabel] = useState('');

  const fetchEpisodesAndSummary = useCallback(async () => {
    if (!id) return;
    const [episodesRes, summaryRes] = await Promise.all([
      supabase
        .from('vocal_episodes')
        .select('*')
        .eq('session_id', id)
        .order('started_at', { ascending: true }),
      supabase.from('session_summaries').select('*').eq('session_id', id).maybeSingle(),
    ]);
    setEpisodes((episodesRes.data as VocalEpisode[] | null) ?? []);
    setSummary(summaryRes.data as SessionSummary | null);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let ignore = false;
    (async () => {
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
      const row = sessionRes.data as Session | null;
      let tagRows: Tag[] = [];
      if (row) {
        const { data } = await supabase
          .from('tags')
          .select('*')
          .eq('dog_id', row.dog_id)
          .order('created_at', { ascending: true });
        tagRows = (data as Tag[] | null) ?? [];
      }
      if (ignore) return;
      setSession(row);
      setNotes(row?.notes ?? '');
      setSummary(summaryRes.data as SessionSummary | null);
      setEpisodes((episodesRes.data as VocalEpisode[] | null) ?? []);
      setTags(tagRows);
      setSelectedTagIds(
        new Set(((sessionTagsRes.data as { tag_id: string }[] | null) ?? []).map((t) => t.tag_id))
      );
      if (row) setEpisodeTime(new Date(row.started_at));
      setIsLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, [id]);

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

  const addTag = async () => {
    if (!session || !tagLabel.trim()) return;
    const { data, error } = await supabase
      .from('tags')
      .insert({ dog_id: session.dog_id, label: tagLabel.trim() })
      .select()
      .single();
    if (error) {
      Alert.alert('Erreur', `Particularité non créée : ${error.message}`);
      return;
    }
    const tag = data as Tag;
    setTags((prev) => [...prev, tag]);
    setTagOpen(false);
    setTagLabel('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // La nouvelle particularité est cochée pour cette session dans la foulée.
    toggleTag(tag);
  };

  const addEpisode = async () => {
    if (!session) return;
    // L'heure choisie s'applique sur le JOUR du début de la session.
    const start = new Date(session.started_at);
    start.setHours(episodeTime.getHours(), episodeTime.getMinutes(), 0, 0);
    setIsAddingEpisode(true);
    const { error } = await supabase.from('vocal_episodes').insert({
      dog_id: session.dog_id,
      session_id: session.id,
      started_at: start.toISOString(),
      ended_at: new Date(start.getTime() + episodeSeconds * 1000).toISOString(),
      kind: episodeKind,
      source: 'manual',
    });
    setIsAddingEpisode(false);
    if (error) {
      Alert.alert('Erreur', `Ajout impossible : ${error.message}`);
      return;
    }
    setEpisodeOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // La frise et les stats (vue session_summaries) se recalculent.
    fetchEpisodesAndSummary();
  };

  /** Écarte (ou restaure) un faux positif de l'agent : gardé en base avec
      son clip (futur jeu de données YAMNet), mais hors stats et frise. */
  const toggleDismissed = async (episode: VocalEpisode) => {
    const next = !episode.dismissed;
    setEpisodes((prev) => prev.map((e) => (e.id === episode.id ? { ...e, dismissed: next } : e)));
    const { error } = await supabase
      .from('vocal_episodes')
      .update({ dismissed: next })
      .eq('id', episode.id);
    if (error) {
      setEpisodes((prev) =>
        prev.map((e) => (e.id === episode.id ? { ...e, dismissed: !next } : e))
      );
      Alert.alert('Erreur', `Modification impossible : ${error.message}`);
      return;
    }
    Haptics.selectionAsync();
    // Les stats (vue session_summaries) excluent les épisodes écartés.
    fetchEpisodesAndSummary();
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
          fetchEpisodesAndSummary();
        },
      },
    ]);
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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
        <Text style={[styles.label, { color: colors.textSecondary }]}>SESSION INTROUVABLE</Text>
      </View>
    );
  }

  const durationSeconds = session.ended_at
    ? (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000
    : null;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>
        🔴 {formatDateTime(session.started_at).toUpperCase()}
      </Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {session.ended_at ? `TERMINÉE À ${formatTime(session.ended_at)}` : 'EN COURS'}
        {session.is_exercise === false ? ' · SUBIE' : ''}
      </Text>

      {/* ------------------------------------------------------- Stats */}
      <View style={styles.statRow}>
        <StatBox
          label="DURÉE TOTALE"
          value={durationSeconds !== null ? formatDuration(durationSeconds) : '—'}
        />
        <StatBox
          label="PLUS LONG ÉPISODE"
          value={summary ? formatDuration(summary.longest_episode_seconds) : '—'}
        />
        <StatBox
          label="% CALME"
          value={summary ? `${Math.round(summary.calm_percent)}%` : '—'}
          valueColor={
            summary ? (summary.calm_percent >= 90 ? colors.success : colors.danger) : undefined
          }
        />
      </View>

      {/* ------------------------------------------------------- Frise */}
      <DialogLabel>CHRONOLOGIE DES VOCALISES</DialogLabel>
      <EpisodeTimeline
        episodes={episodes.filter((e) => !e.dismissed)}
        sessionStart={session.started_at}
        sessionEnd={session.ended_at}
        nowMs={nowMs}
        showLegend={false}
      />

      {/* ---------------- Détail des épisodes (clips, écarter, supprimer) */}
      {episodes.map((episode) => (
        <View key={episode.id} style={[styles.episodeRow, episode.dismissed && styles.dismissed]}>
          <View style={[styles.episodeDot, { backgroundColor: colors[episode.kind] }]} />
          <Text style={[styles.episodeText, { color: colors.text }]}>
            {formatTime(episode.started_at)} · {KIND_LABELS[episode.kind].toUpperCase()} ·{' '}
            {formatDuration(episodeDurationSeconds(episode.started_at, episode.ended_at))}
            {episode.source === 'manual' ? ' · MANUEL' : ''}
            {episode.dismissed ? ' · ÉCARTÉ' : ''}
          </Text>
          {episode.clip_path ? <ClipButton clipPath={episode.clip_path} /> : null}
          {episode.source === 'manual' ? (
            <Pressable onPress={() => deleteManualEpisode(episode)} hitSlop={8}>
              <Text style={[styles.episodeDelete, { color: colors.danger }]}>✕</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => toggleDismissed(episode)} hitSlop={8}>
              <Text
                style={[
                  styles.episodeAction,
                  { color: episode.dismissed ? colors.accent : colors.danger },
                ]}>
                {episode.dismissed ? 'RESTAURER' : 'ÉCARTER'}
              </Text>
            </Pressable>
          )}
        </View>
      ))}
      {episodes.length === 0 ? (
        <Text style={[styles.episodeText, { color: colors.textSecondary }]}>
          AUCUNE VOCALISE PENDANT CETTE SESSION 🎉
        </Text>
      ) : null}
      <Pressable onPress={() => setEpisodeOpen(true)} hitSlop={6} style={styles.addEpisode}>
        <Text style={[styles.addEpisodeText, { color: colors.accent }]}>
          ＋ AJOUTER UN ÉPISODE
        </Text>
      </Pressable>

      {/* ----------------------------------------------- Particularités */}
      <DialogLabel>PARTICULARITÉS</DialogLabel>
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
                  backgroundColor: selected ? colors.accent : colors.card,
                  borderColor: colors.border,
                },
              ]}>
              <Text
                style={[styles.tagChipText, { color: selected ? colors.accentText : colors.text }]}>
                {tag.label.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setTagOpen(true)}
          style={[styles.tagChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.tagChipText, { color: colors.accent }]}>＋</Text>
        </Pressable>
      </View>

      {/* ------------------------------------------------------- Notes */}
      <DialogLabel>NOTES</DialogLabel>
      <DialogNotes
        value={notes}
        onChangeText={setNotes}
        placeholder="Contexte, météo, promenade avant le départ…"
      />
      <Pressable
        onPress={saveNotes}
        disabled={isSaving}
        style={[
          styles.saveButton,
          { backgroundColor: colors.accent, borderColor: colors.border, opacity: isSaving ? 0.5 : 1 },
        ]}>
        <Text style={[styles.saveButtonText, { color: colors.accentText }]}>ENREGISTRER</Text>
      </Pressable>

      {/* --------------------------- Modale « ajouter un épisode » ------- */}
      <PixelDialog
        visible={episodeOpen}
        onRequestClose={() => setEpisodeOpen(false)}
        title="🎤 AJOUTER UN ÉPISODE"
        topOffset={insets.top + 40}>
        <DialogLabel>UN ÉPISODE RATÉ PAR L&apos;AGENT…</DialogLabel>
        <View style={styles.row}>
          {KINDS.map(({ value, label }) => (
            <Chip
              key={value}
              label={label}
              selected={episodeKind === value}
              onPress={() => setEpisodeKind(value)}
            />
          ))}
        </View>
        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <DialogLabel>HEURE</DialogLabel>
            <DateTimePicker
              value={episodeTime}
              mode="time"
              display="compact"
              themeVariant={scheme === 'dark' ? 'dark' : 'light'}
              onChange={(_, date) => {
                if (date) setEpisodeTime(date);
              }}
            />
          </View>
        </View>
        <DialogLabel>DURÉE</DialogLabel>
        {[0, 3].map((i) => (
          <View key={i} style={styles.row}>
            {EPISODE_DURATIONS.slice(i, i + 3).map(({ seconds, label }) => (
              <Chip
                key={seconds}
                label={label}
                selected={episodeSeconds === seconds}
                onPress={() => setEpisodeSeconds(seconds)}
              />
            ))}
          </View>
        ))}
        <DialogButtons
          onCancel={() => setEpisodeOpen(false)}
          onConfirm={addEpisode}
          confirmLabel="AJOUTER"
          confirmDisabled={isAddingEpisode}
        />
      </PixelDialog>

      {/* ------------------------ Modale « nouvelle particularité » ------ */}
      <PixelDialog
        visible={tagOpen}
        onRequestClose={() => setTagOpen(false)}
        title="🏷 NOUVELLE PARTICULARITÉ"
        topOffset={insets.top + 40}>
        <DialogLabel>ELLE SERA COCHABLE SUR TOUTES LES SESSIONS</DialogLabel>
        <TextInput
          value={tagLabel}
          onChangeText={setTagLabel}
          placeholder="Ex. Tapis de léchage"
          placeholderTextColor={colors.textSecondary}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={addTag}
          style={[
            styles.tagInput,
            { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
          ]}
        />
        <DialogButtons
          onCancel={() => {
            setTagOpen(false);
            setTagLabel('');
          }}
          onConfirm={addTag}
          confirmLabel="CRÉER"
          confirmDisabled={!tagLabel.trim()}
        />
      </PixelDialog>
    </ScrollView>
  );
}

/** Bouton pixel « voir le clip vidéo » d'un épisode (URL signée 1 h). */
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
      style={[
        styles.clipButton,
        { backgroundColor: colors.accent, borderColor: colors.border, opacity: isOpening ? 0.5 : 1 },
      ]}>
      {isOpening ? (
        <ActivityIndicator size="small" color={colors.accentText} />
      ) : (
        <Text style={[styles.clipButtonText, { color: colors.accentText }]}>▶ CLIP</Text>
      )}
    </Pressable>
  );
}

/** Petite carte de stat pixel (valeur + libellé). */
function StatBox({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: valueColor ?? colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: 48,
  },
  title: {
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    fontSize: 8,
    marginBottom: 4,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
  },
  statBox: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 12,
  },
  statLabel: {
    fontSize: 6,
    textAlign: 'center',
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  episodeDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  episodeText: {
    fontSize: 7,
    lineHeight: 11,
    flex: 1,
    flexShrink: 1,
  },
  episodeDelete: {
    fontSize: 10,
  },
  episodeAction: {
    fontSize: 7,
  },
  // Épisode écarté : visible mais grisé (il reste consultable, clip inclus).
  dismissed: {
    opacity: 0.45,
  },
  clipButton: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  clipButtonText: {
    fontSize: 7,
  },
  addEpisode: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  addEpisodeText: {
    fontSize: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tagChipText: {
    fontSize: 8,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timeRow: {
    flexDirection: 'row',
    marginTop: 2,
  },
  timeCol: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
  tagInput: {
    borderWidth: 2,
    borderRadius: 2,
    padding: Spacing.sm,
    fontSize: 9,
  },
  saveButton: {
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  saveButtonText: {
    fontSize: 9,
  },
});
