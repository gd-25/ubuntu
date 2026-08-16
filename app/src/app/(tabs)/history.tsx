import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Link, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeOut, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip, DialogButtons, DialogLabel, DialogNotes, PixelDialog } from '@/components/home/pixel-dialog';
import type { Participant } from '@/components/home/solo-picker';
import { ScreenTitle } from '@/components/screen-title';
import { Text } from '@/components/text';
import { EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatDuration, formatTime, parisDayKey } from '@/lib/format';
import { DEFAULT_GOALS, fetchGoals, type Goals } from '@/lib/goals';
import { SPACE_LABELS } from '@/lib/house';
import { supabase } from '@/lib/supabase';
import type {
  Activity,
  DayNote,
  FakeCue,
  Night,
  OverallSession,
  SemiSoloSession,
  SessionSummary,
} from '@/lib/types';
import { useDog } from '@/lib/use-dog';

/** Types d'événements du journal (filtrables). */
type EventType =
  | 'session'
  | 'semi_solo'
  | 'walk'
  | 'meal'
  | 'mat'
  | 'fake_cue'
  | 'care'
  | 'velcro'
  | 'night'
  | 'overall';

const EVENT_DEFS: { type: EventType; emoji: string; label: string }[] = [
  { type: 'session', emoji: '🔴', label: 'SESSIONS' },
  { type: 'semi_solo', emoji: '🧍', label: 'SEMI SOLO' },
  { type: 'night', emoji: '🌙', label: 'NUITS' },
  { type: 'walk', emoji: '🚶', label: 'SORTIES' },
  { type: 'meal', emoji: '🍖', label: 'REPAS' },
  { type: 'mat', emoji: '🐾', label: 'TAPIS' },
  { type: 'fake_cue', emoji: '🔑', label: 'FAUX SIGNAUX' },
  { type: 'overall', emoji: '🎯', label: 'EXERCICES' },
  { type: 'velcro', emoji: '🍯', label: 'VELCRO' },
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
  outside_room: 'en dehors de la chambre',
  in_room: 'dans la chambre',
  half_half: 'moitié dans la chambre',
  on_bed: 'sur le lit',
} as const;

const MEAL_KIND_LABELS = { kibble: 'croquettes', pate: 'pâté', other: 'autre' } as const;

/** Seuil de calme (%) à partir duquel une session est « réussie ». */
const CALM_SUCCESS_PERCENT = 90;

/** Périodes proposées par le bouton COPIER (`days: null` = tout). */
interface CopyRange {
  label: string;
  days: number | null;
}

const COPY_RANGES: CopyRange[] = [
  { label: '3 derniers jours', days: 3 },
  { label: 'Dernière semaine', days: 7 },
  { label: 'Dernier mois', days: 30 },
  { label: 'Tout l’historique', days: null },
];

/**
 * Qui a laissé Ubuntu seul (remplace l'ancienne particularité « Départ à
 * deux ») — repris dans l'export texte des sessions.
 */
function participantsLabel(people: Participant[] | undefined): string | null {
  if (!people || people.length === 0) return null;
  if (people.includes('greg') && people.includes('fiona')) return 'qui part : Greg et Fiona';
  if (people.includes('greg')) return 'qui part : Greg seul (Fiona absente)';
  return 'qui part : Fiona seule (Greg absent)';
}

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
  table: 'sessions' | 'activities' | 'nights' | 'overall_sessions' | 'semi_solo_sessions';
  id: string;
}

interface DaySection {
  title: string;
  /** Clé triable du jour (AAAA-MM-JJ, heure de Paris) — note du jour. */
  dayKey: string;
  data: FeedItem[];
}

export default function HistoryScreen() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const { dog } = useDog();
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [overalls, setOveralls] = useState<OverallSession[]>([]);
  const [semiSolos, setSemiSolos] = useState<SemiSoloSession[]>([]);
  /** Notes de journée, indexées par jour AAAA-MM-JJ. */
  const [dayNotes, setDayNotes] = useState<Record<string, DayNote>>({});
  /** Jour en cours d'édition dans la modale note (clé + libellé). */
  const [noteEditor, setNoteEditor] = useState<{ dayKey: string; title: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  /** Objectifs quotidiens (pour la légende de l'export COPIER). */
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [enabled, setEnabled] = useState<EventType[]>(ALL_TYPES);
  const [filterOpen, setFilterOpen] = useState(false);
  /** Menu de période du bouton COPIER. */
  const [copyOpen, setCopyOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [sessionsRes, activitiesRes, nightsRes, overallsRes, semiSolosRes, dayNotesRes] =
      await Promise.all([
      supabase
        .from('session_summaries')
        .select('*')
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(100),
      supabase.from('activities').select('*').order('at', { ascending: false }).limit(200),
      supabase.from('nights').select('*').order('started_at', { ascending: false }).limit(60),
      supabase.from('overall_sessions').select('*').order('at', { ascending: false }).limit(60),
      supabase
        .from('semi_solo_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(100),
      supabase.from('day_notes').select('*').order('day', { ascending: false }).limit(120),
    ]);
    if (sessionsRes.error)
      console.warn('Chargement de l’historique impossible :', sessionsRes.error.message);
    setSummaries((sessionsRes.data as SessionSummary[] | null) ?? []);
    setActivities((activitiesRes.data as Activity[] | null) ?? []);
    setNights((nightsRes.data as Night[] | null) ?? []);
    setOveralls((overallsRes.data as OverallSession[] | null) ?? []);
    setSemiSolos((semiSolosRes.data as SemiSoloSession[] | null) ?? []);
    const notesByDay: Record<string, DayNote> = {};
    for (const n of (dayNotesRes.data as DayNote[] | null) ?? []) notesByDay[n.day] = n;
    setDayNotes(notesByDay);
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
        // Session réussie (≥ 90 % de calme) : pastille verte ; sinon
        // pastille rouge et pourcentage en rouge.
        const dot = s.calm_percent >= CALM_SUCCESS_PERCENT ? '🟢' : '🔴';
        items.push({
          key: `s-${s.session_id}`,
          type: 'session',
          at: s.started_at,
          title: `${dot} ${formatTime(s.started_at)}${s.ended_at ? ` → ${formatTime(s.ended_at)}` : ''}`,
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
      } else if (a.kind === 'velcro' && enabled.includes('velcro')) {
        const seconds = a.ended_at
          ? (new Date(a.ended_at).getTime() - new Date(a.at).getTime()) / 1000
          : null;
        items.push({
          ...base,
          type: 'velcro',
          title: `🍯 ${formatTime(a.at)}${a.ended_at ? ` → ${formatTime(a.ended_at)}` : ''}`,
          detail: info([
            'pot de colle',
            seconds != null ? formatDuration(seconds) : null,
            a.notes,
          ]),
        });
      }
    }
    if (enabled.includes('semi_solo')) {
      for (const s of semiSolos) {
        const seconds =
          (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000;
        items.push({
          key: `ss-${s.id}`,
          type: 'semi_solo',
          at: s.started_at,
          title: `🧍 ${formatTime(s.started_at)} → ${formatTime(s.ended_at)}`,
          detail: info(['semi solo', formatDuration(seconds), s.notes]),
          href: { pathname: '/event/[kind]/[id]', params: { kind: 'semi_solo', id: s.id } },
          table: 'semi_solo_sessions',
          id: s.id,
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
            'exercice',
            `${o.duration_minutes} min`,
            o.mat_space ? SPACE_LABELS[o.mat_space].toLowerCase() : null,
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
      else byDay.push({ title, dayKey: parisDayKey(item.at), data: [item] });
    }
    return byDay;
  }, [summaries, activities, nights, overalls, semiSolos, enabled]);

  /** Enregistre (upsert) ou efface la note du jour en cours d'édition. */
  const saveDayNote = useCallback(async () => {
    if (!noteEditor || !dog) return;
    const content = noteDraft.trim();
    const { dayKey } = noteEditor;
    if (!content) {
      // Champ vidé → la note disparaît.
      const { error } = await supabase
        .from('day_notes')
        .delete()
        .eq('dog_id', dog.id)
        .eq('day', dayKey);
      if (error) {
        Alert.alert('Erreur', `Note non supprimée : ${error.message}`);
        return;
      }
      setDayNotes((prev) => {
        const next = { ...prev };
        delete next[dayKey];
        return next;
      });
      setNoteEditor(null);
      return;
    }
    const { data, error } = await supabase
      .from('day_notes')
      .upsert(
        { dog_id: dog.id, day: dayKey, content, updated_at: new Date().toISOString() },
        { onConflict: 'dog_id,day' }
      )
      .select()
      .single();
    if (error) {
      Alert.alert('Erreur', `Note non enregistrée : ${error.message}`);
      return;
    }
    setDayNotes((prev) => ({ ...prev, [dayKey]: data as DayNote }));
    setNoteEditor(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [noteEditor, noteDraft, dog]);

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

  /**
   * COPIER : l'historique en texte brut sur la période choisie, pensé pour
   * être collé dans un LLM (légende en tête, événements groupés par jour,
   * du plus ancien au plus récent, durées et commentaires inclus).
   *
   * Les données sont RECHARGÉES ici : les listes de l'écran sont plafonnées
   * (100 sessions, 200 activités…) et ne suffisent pas pour « tout
   * l'historique ».
   */
  const copyRange = useCallback(async (range: CopyRange) => {
    setCopyOpen(false);
    const sinceIso = range.days
      ? new Date(Date.now() - range.days * 24 * 3600 * 1000).toISOString()
      : new Date(0).toISOString();
    const dur = (startIso: string, endIso: string | null) =>
      endIso
        ? formatDuration((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000)
        : 'en cours';

    const [
      summariesRes,
      sessionRowsRes,
      activitiesRes,
      nightsRes,
      overallsRes,
      semiSolosRes,
      dayNotesRes,
    ] = await Promise.all([
      supabase
        .from('session_summaries')
        .select('*')
        .not('ended_at', 'is', null)
        .gte('started_at', sinceIso)
        .order('started_at', { ascending: true })
        .limit(1000),
      // Notes et participants ne sont pas dans la vue session_summaries.
      supabase.from('sessions').select('id, notes, participants').gte('started_at', sinceIso).limit(1000),
      supabase.from('activities').select('*').gte('at', sinceIso).limit(3000),
      supabase.from('nights').select('*').gte('ended_at', sinceIso).limit(500),
      supabase.from('overall_sessions').select('*').gte('at', sinceIso).limit(500),
      supabase.from('semi_solo_sessions').select('*').gte('started_at', sinceIso).limit(1000),
      supabase.from('day_notes').select('*').limit(1000),
    ]);

    const rangeSummaries = (summariesRes.data as SessionSummary[] | null) ?? [];
    const sessionRows =
      (sessionRowsRes.data as
        | { id: string; notes: string | null; participants: Participant[] }[]
        | null) ?? [];
    const rangeActivities = (activitiesRes.data as Activity[] | null) ?? [];
    const rangeNights = (nightsRes.data as Night[] | null) ?? [];
    const rangeOveralls = (overallsRes.data as OverallSession[] | null) ?? [];
    const rangeSemiSolos = (semiSolosRes.data as SemiSoloSession[] | null) ?? [];
    const rangeDayNotes: Record<string, DayNote> = {};
    for (const n of (dayNotesRes.data as DayNote[] | null) ?? []) rangeDayNotes[n.day] = n;

    const sessionNotes = new Map(sessionRows.map((r) => [r.id, r.notes]));
    const sessionParticipants = new Map(sessionRows.map((r) => [r.id, r.participants]));

    const info = (parts: (string | null | undefined | false)[]) =>
      parts.filter(Boolean).join(', ');
    const lines: { at: string; text: string }[] = [];

    for (const s of rangeSummaries) {
      const notes = sessionNotes.get(s.session_id);
      lines.push({
        at: s.started_at,
        text:
          `${formatTime(s.started_at)}–${s.ended_at ? formatTime(s.ended_at) : '?'} SESSION SOLO ` +
          `(${dur(s.started_at, s.ended_at)}) — ${info([
            participantsLabel(sessionParticipants.get(s.session_id)),
            `${s.episode_count} épisode${s.episode_count > 1 ? 's' : ''} de vocalises`,
            `${formatDuration(s.total_vocal_seconds)} vocalisées`,
            `${Math.round(s.calm_percent)} % calme`,
            s.is_exercise === false && 'absence subie (pas un exercice)',
            notes ? `notes : ${notes}` : null,
          ])}`,
      });
    }
    for (const s of rangeSemiSolos) {
      lines.push({
        at: s.started_at,
        text:
          `${formatTime(s.started_at)}–${formatTime(s.ended_at)} SEMI SOLO ` +
          `(${dur(s.started_at, s.ended_at)})${s.notes ? ` — notes : ${s.notes}` : ''}`,
      });
    }
    for (const a of rangeActivities) {
      if (a.kind === 'walk') {
        lines.push({
          at: a.at,
          text: `${formatTime(a.at)}${a.ended_at ? `–${formatTime(a.ended_at)}` : ''} SORTIE (${dur(a.at, a.ended_at)}) — ${info([
            a.poop_small && 'petit caca',
            a.poop_big && 'gros caca',
            a.off_leash && 'lâché en liberté',
            a.notes ? `notes : ${a.notes}` : null,
          ]) || 'rien à signaler'}`,
        });
      } else if (a.kind === 'meal') {
        lines.push({
          at: a.at,
          text: `${formatTime(a.at)} REPAS — ${info([
            a.meal_fraction != null ? `${FRACTION_LABELS[a.meal_fraction] ?? a.meal_fraction} de la ration` : null,
            a.meal_kind ? MEAL_KIND_LABELS[a.meal_kind] : null,
            a.notes ? `notes : ${a.notes}` : null,
          ])}`,
        });
      } else if (a.kind === 'mat') {
        lines.push({ at: a.at, text: `${formatTime(a.at)} VISITE DU TAPIS (Ubuntu est allé de lui-même sur son tapis)` });
      } else if (a.kind === 'fake_cue') {
        lines.push({
          at: a.at,
          text: `${formatTime(a.at)} FAUX SIGNAL DE DÉPART — ${info([
            (a.cues ?? []).map((c) => CUE_LABELS[c] ?? c).join(' + ') || null,
            a.notes ? `notes : ${a.notes}` : null,
          ])}`,
        });
      } else if (a.kind === 'care') {
        lines.push({
          at: a.at,
          text: `${formatTime(a.at)} GARDE — ${info([
            a.caregiver ? `gardé par ${a.caregiver}` : null,
            a.duration_minutes ? formatDuration(a.duration_minutes * 60) : null,
            a.notes ? `notes : ${a.notes}` : null,
          ])}`,
        });
      } else if (a.kind === 'velcro') {
        lines.push({
          at: a.at,
          text: `${formatTime(a.at)}${a.ended_at ? `–${formatTime(a.ended_at)}` : ''} VELCRO (pot de colle, ${dur(a.at, a.ended_at)})${a.notes ? ` — notes : ${a.notes}` : ''}`,
        });
      }
    }
    for (const n of rangeNights) {
      lines.push({
        at: n.ended_at,
        text: `${formatTime(n.started_at)}–${formatTime(n.ended_at)} NUIT — ${info([
          NIGHT_LOCATION_LABELS[n.location],
          n.basket_space ? `panier : ${SPACE_LABELS[n.basket_space].toLowerCase()}` : null,
          n.notes ? `notes : ${n.notes}` : null,
        ])}`,
      });
    }
    for (const o of rangeOveralls) {
      lines.push({
        at: o.at,
        text: `${formatTime(o.at)} EXERCICE DE DRESSAGE — ${info([
          `${o.duration_minutes} min`,
          o.mat_space ? `tapis dans ${SPACE_LABELS[o.mat_space].toLowerCase()}` : null,
          o.notes ? `description : ${o.notes}` : null,
        ])}`,
      });
    }

    lines.sort((a, b) => (a.at < b.at ? -1 : 1));

    const byDay: string[] = [];
    let currentDay = '';
    for (const line of lines) {
      const day = formatDate(line.at);
      if (day !== currentDay) {
        currentDay = day;
        byDay.push(`\n=== ${day} ===`);
        // Note libre de la journée (ex. où était Ubuntu), en tête du jour.
        const note = rangeDayNotes[parisDayKey(line.at)];
        if (note) byDay.push(`Note du jour : ${note.content}`);
      }
      byDay.push(`- ${line.text}`);
    }

    const period = range.days
      ? `${range.label.toLowerCase()}, du ${formatDate(sinceIso)} au ${formatDate(new Date().toISOString())}`
      : `tout l'historique${lines.length > 0 ? `, du ${formatDate(lines[0].at)} au ${formatDate(new Date().toISOString())}` : ''}`;
    const header = [
      `HISTORIQUE D'UBUNTU (chien) — ${period}.`,
      `Contexte : Ubuntu est un chien qu'on entraîne à rester seul (anxiété de séparation). Ses vocalises sont surveillées par caméra pendant les sessions.`,
      `Types d'événements :`,
      `- SESSION SOLO : Ubuntu seul à la maison (ou sur le palier) ; « % calme » = part du temps sans vocalise ; « qui part » = qui était là et l'a laissé seul (Greg, Fiona ou les deux).`,
      `- SEMI SOLO : Ubuntu seul dans une pièce pendant qu'un humain est dans une autre pièce (objectif ${goals.semiSoloMinutes} min/jour).`,
      `- NUIT : où Ubuntu a dormi.`,
      `- SORTIE : balade. REPAS : nourriture. VISITE DU TAPIS : il va de lui-même se poser sur son tapis.`,
      `- FAUX SIGNAL DE DÉPART : désensibilisation (on joue avec clés/chaussures… sans partir, objectif ${goals.cues}/jour).`,
      `- EXERCICE DE DRESSAGE : session d'entraînement (Overall, obéissance… — objectif ${goals.overalls}/jour).`,
      `- VELCRO : il est « pot de colle », nous suit partout.`,
      `- GARDE : gardé par quelqu'un d'autre.`,
      `- « Note du jour » : note libre sur la journée (ex. où était Ubuntu s'il n'était pas à la maison).`,
    ].join('\n');

    await Clipboard.setStringAsync(`${header}\n${byDay.join('\n')}\n`);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      'Copié !',
      `${range.label} : ${lines.length} événement${lines.length > 1 ? 's' : ''} dans le presse-papier.`
    );
  }, [goals]);

  const filterCount = enabled.length;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Titre fixe + bouton FILTRER */}
      <View style={styles.titleWrap}>
        <ScreenTitle
          title="JOURNAL"
          right={
            <View style={styles.headerButtons}>
              <Pressable
                onPress={() => setCopyOpen(true)}
                style={[
                  styles.filterButton,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}>
                <Text style={[styles.filterButtonText, { color: colors.text }]}>⧉ COPIER</Text>
              </Pressable>
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
            </View>
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
            {/* Tap sur la date → note libre de la journée, affichée juste
                à côté (une ligne max, ellipsée). */}
            <Pressable
              onPress={() => {
                setNoteEditor({ dayKey: section.dayKey, title: section.title });
                setNoteDraft(dayNotes[section.dayKey]?.content ?? '');
              }}
              hitSlop={6}
              style={[styles.dayChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.dayChipText, { color: colors.text }]}>
                {section.title.toUpperCase()}
              </Text>
            </Pressable>
            {dayNotes[section.dayKey] ? (
              <Text
                style={[styles.dayNoteText, { color: colors.textSecondary }]}
                numberOfLines={1}>
                📍 {dayNotes[section.dayKey].content}
              </Text>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => <FeedRow item={item} onDelete={() => deleteItem(item)} />}
      />

      {/* COPIER : choix de la période avant de remplir le presse-papier */}
      <PixelDialog
        visible={copyOpen}
        onRequestClose={() => setCopyOpen(false)}
        title="⧉ COPIER LE JOURNAL"
        topOffset={insets.top + 40}>
        <DialogLabel>QUELLE PÉRIODE ?</DialogLabel>
        {COPY_RANGES.map((range) => (
          <View key={range.label} style={styles.copyRow}>
            <Chip
              label={range.label.toUpperCase()}
              selected={false}
              onPress={() => copyRange(range)}
            />
          </View>
        ))}
        <Pressable onPress={() => setCopyOpen(false)} hitSlop={8} style={styles.copyClose}>
          <Text style={[styles.copyCloseText, { color: colors.textSecondary }]}>FERMER</Text>
        </Pressable>
      </PixelDialog>

      {/* Filtres : sélectionner les événements à afficher */}
      <PixelDialog
        visible={filterOpen}
        onRequestClose={() => setFilterOpen(false)}
        title="⚙ FILTRER LE JOURNAL"
        topOffset={insets.top + 40}>
        <DialogLabel>AFFICHER…</DialogLabel>
        {[0, 2, 4, 6, 8].map((i) => (
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

      {/* Note du jour : texte libre attaché à la journée (lieu de Boubou…) */}
      <PixelDialog
        visible={!!noteEditor}
        onRequestClose={() => setNoteEditor(null)}
        title={`✏️ ${(noteEditor?.title ?? '').toUpperCase()}`}
        topOffset={insets.top + 40}>
        <DialogLabel>NOTE DE LA JOURNÉE (LIEU, CONTEXTE…)</DialogLabel>
        <DialogNotes
          value={noteDraft}
          onChangeText={setNoteDraft}
          placeholder="Ex. Boubou chez les parents de Greg…"
        />
        <DialogButtons
          onCancel={() => setNoteEditor(null)}
          onConfirm={saveDayNote}
          confirmLabel="ENREGISTRER"
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
              <Text
                style={[
                  styles.calm,
                  {
                    color:
                      item.calmPercent >= CALM_SUCCESS_PERCENT ? colors.success : colors.danger,
                  },
                ]}>
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
  headerButtons: {
    flexDirection: 'row',
    gap: 6,
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
  // Une période par ligne (le Chip est en flex: 1).
  copyRow: {
    flexDirection: 'row',
  },
  copyClose: {
    alignSelf: 'center',
    paddingTop: 4,
  },
  copyCloseText: {
    fontSize: 8,
  },
  content: {
    padding: Spacing.md,
    paddingTop: Spacing.xs,
    flexGrow: 1,
    paddingBottom: 24,
  },
  // Date + note de la journée côte à côte (la note s'ellipse sur 1 ligne).
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  dayNoteText: {
    flex: 1,
    fontSize: 7,
    lineHeight: 12,
  },
  dayChip: {
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
