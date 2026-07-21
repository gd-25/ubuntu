import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';

import { MapFocus } from '@/components/home/map-focus';
import { Chip, DialogNotes } from '@/components/home/pixel-dialog';
import { Text, TextInput } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SPACE_LABELS } from '@/lib/house';
import { supabase } from '@/lib/supabase';
import type { Activity, FakeCue, MealKind, Night, NightLocation, OverallSession } from '@/lib/types';

const MEAL_FRACTIONS = [
  { value: 0.25, label: '¼' },
  { value: 0.5, label: '½' },
  { value: 0.75, label: '¾' },
  { value: 1, label: 'TOUT' },
] as const;

const MEAL_KINDS: { value: MealKind; emoji: string; label: string }[] = [
  { value: 'kibble', emoji: '🦴', label: 'CROQS' },
  { value: 'pate', emoji: '🥫', label: 'PÂTÉ' },
  { value: 'other', emoji: '🍗', label: 'AUTRE' },
];

const CUES: { value: FakeCue; emoji: string; label: string }[] = [
  { value: 'keys', emoji: '🔑', label: 'CLÉS' },
  { value: 'shoes', emoji: '👟', label: 'CHAUSSURES' },
  { value: 'socks', emoji: '🧦', label: 'CHAUSSETTES' },
  { value: 'elevator', emoji: '🛗', label: 'ASCENSEUR' },
  { value: 'stairs', emoji: '🪜', label: 'ESCALIER' },
  { value: 'gate', emoji: '🚧', label: 'PORTAIL' },
];

const LOCATIONS: { value: NightLocation; emoji: string; label: string }[] = [
  { value: 'outside_room', emoji: '🚪', label: 'HORS DE LA CHAMBRE FERMÉE' },
  { value: 'in_room', emoji: '🛋', label: 'DANS LA CHAMBRE, PAS SUR LE LIT' },
  { value: 'on_bed', emoji: '🛏', label: 'SUR LE LIT' },
];

const DURATIONS = [2, 5, 10, 15, 20, 30] as const;

const CARE_DURATIONS = [
  { minutes: 30, label: '30 MIN' },
  { minutes: 60, label: '1 H' },
  { minutes: 120, label: '2 H' },
  { minutes: 180, label: '3 H' },
  { minutes: 240, label: '½ JOUR' },
  { minutes: 480, label: 'JOUR' },
] as const;

const ACTIVITY_TITLES: Record<string, string> = {
  walk: '🚶 SORTIE',
  meal: '🍖 REPAS',
  mat: '🐾 VISITE DU TAPIS',
  fake_cue: '🔑 FAUX SIGNAL',
  care: '🤝 GARDE',
  play: '🎾 JEU',
  other: '📝 ACTIVITÉ',
};

/** Applique l'heure `time` sur la DATE de `base` (édition d'heure seule). */
function withTime(base: Date, time: Date): Date {
  const next = new Date(base);
  next.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return next;
}

/**
 * Détail ÉDITABLE d'une entrée du journal (tout sauf les sessions de
 * solitude, qui ont leur propre écran). `kind` désigne la table :
 * activity | night | overall.
 */
export default function EventDetailScreen() {
  const colors = useTheme();
  const scheme = useColorScheme();
  const router = useRouter();
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [night, setNight] = useState<Night | null>(null);
  const [overall, setOverall] = useState<OverallSession | null>(null);

  // Champs éditables (initialisés au chargement de la ligne).
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(new Date());
  const [hasEnd, setHasEnd] = useState(false);
  const [notes, setNotes] = useState('');
  const [mealKind, setMealKind] = useState<MealKind>('kibble');
  const [fraction, setFraction] = useState<number>(0.5);
  const [poopSmall, setPoopSmall] = useState(false);
  const [poopBig, setPoopBig] = useState(false);
  const [offLeash, setOffLeash] = useState(false);
  const [cues, setCues] = useState<FakeCue[]>([]);
  const [caregiver, setCaregiver] = useState('');
  const [careMinutes, setCareMinutes] = useState<number>(120);
  const [location, setLocation] = useState<NightLocation>('outside_room');
  const [duration, setDuration] = useState<number>(5);

  useEffect(() => {
    if (!kind || !id) return;
    (async () => {
      if (kind === 'activity') {
        const { data } = await supabase.from('activities').select('*').eq('id', id).maybeSingle();
        const row = data as Activity | null;
        if (!row) return;
        setActivity(row);
        setStartTime(new Date(row.at));
        setHasEnd(!!row.ended_at);
        if (row.ended_at) setEndTime(new Date(row.ended_at));
        setNotes(row.notes ?? '');
        if (row.meal_kind) setMealKind(row.meal_kind);
        if (row.meal_fraction != null) setFraction(row.meal_fraction);
        setPoopSmall(!!row.poop_small);
        setPoopBig(!!row.poop_big);
        setOffLeash(!!row.off_leash);
        setCues(row.cues ?? []);
        setCaregiver(row.caregiver ?? '');
        if (row.duration_minutes) setCareMinutes(row.duration_minutes);
      } else if (kind === 'night') {
        const { data } = await supabase.from('nights').select('*').eq('id', id).maybeSingle();
        const row = data as Night | null;
        if (!row) return;
        setNight(row);
        setStartTime(new Date(row.started_at));
        setEndTime(new Date(row.ended_at));
        setNotes(row.notes ?? '');
        setLocation(row.location);
      } else if (kind === 'overall') {
        const { data } = await supabase
          .from('overall_sessions')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        const row = data as OverallSession | null;
        if (!row) return;
        setOverall(row);
        setNotes(row.notes ?? '');
        setDuration(row.duration_minutes);
      }
    })();
  }, [kind, id]);

  const save = async () => {
    let error: { message: string } | null = null;
    if (kind === 'activity' && activity) {
      const at = withTime(new Date(activity.at), startTime);
      let endedAt: string | null = activity.ended_at;
      if (hasEnd) {
        const end = withTime(new Date(activity.ended_at ?? activity.at), endTime);
        if (at.getTime() > end.getTime()) at.setDate(at.getDate() - 1);
        endedAt = end.toISOString();
      }
      ({ error } = await supabase
        .from('activities')
        .update({
          at: at.toISOString(),
          ended_at: endedAt,
          notes: notes.trim() || null,
          ...(activity.kind === 'meal' ? { meal_kind: mealKind, meal_fraction: fraction } : {}),
          ...(activity.kind === 'walk'
            ? { poop_small: poopSmall, poop_big: poopBig, off_leash: offLeash }
            : {}),
          ...(activity.kind === 'fake_cue' ? { cues } : {}),
          ...(activity.kind === 'care'
            ? { caregiver: caregiver.trim() || null, duration_minutes: careMinutes }
            : {}),
        })
        .eq('id', activity.id));
    } else if (kind === 'night' && night) {
      const started = withTime(new Date(night.started_at), startTime);
      const ended = withTime(new Date(night.ended_at), endTime);
      if (started.getTime() >= ended.getTime()) started.setDate(started.getDate() - 1);
      ({ error } = await supabase
        .from('nights')
        .update({
          started_at: started.toISOString(),
          ended_at: ended.toISOString(),
          location,
          notes: notes.trim() || null,
        })
        .eq('id', night.id));
    } else if (kind === 'overall' && overall) {
      ({ error } = await supabase
        .from('overall_sessions')
        .update({ duration_minutes: duration, notes: notes.trim() || null })
        .eq('id', overall.id));
    }
    if (error) {
      Alert.alert('Erreur', `Modification impossible : ${error.message}`);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const remove = () => {
    const table =
      kind === 'activity' ? 'activities' : kind === 'night' ? 'nights' : 'overall_sessions';
    Alert.alert('Supprimer cette entrée ?', 'Cette action est définitive.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from(table).delete().eq('id', id);
          if (error) {
            Alert.alert('Erreur', `Suppression impossible : ${error.message}`);
            return;
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
      },
    ]);
  };

  const title =
    kind === 'night'
      ? '🌙 NUIT'
      : kind === 'overall'
        ? '🎯 SESSION OVERALL'
        : ACTIVITY_TITLES[activity?.kind ?? ''] ?? '…';

  const loaded = activity || night || overall;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {!loaded ? (
        <Text style={[styles.label, { color: colors.textSecondary }]}>CHARGEMENT…</Text>
      ) : (
        <>
          {/* ---------------------------------------------------- Horaires */}
          {kind === 'overall' ? null : (
            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {kind === 'night' ? 'COUCHER' : hasEnd ? 'DÉPART' : 'HEURE'}
                </Text>
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  display="compact"
                  themeVariant={scheme === 'dark' ? 'dark' : 'light'}
                  onChange={(_, date) => {
                    if (date) setStartTime(date);
                  }}
                />
              </View>
              {kind === 'night' || hasEnd ? (
                <View style={styles.timeCol}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    {kind === 'night' ? 'LEVER' : 'ARRIVÉE'}
                  </Text>
                  <DateTimePicker
                    value={endTime}
                    mode="time"
                    display="compact"
                    themeVariant={scheme === 'dark' ? 'dark' : 'light'}
                    onChange={(_, date) => {
                      if (date) setEndTime(date);
                    }}
                  />
                </View>
              ) : null}
            </View>
          )}

          {/* ------------------------------------------- Champs par type */}
          {activity?.kind === 'meal' ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>QUOI ?</Text>
              <View style={styles.row}>
                {MEAL_KINDS.map(({ value, emoji, label }) => (
                  <Chip
                    key={value}
                    emoji={emoji}
                    label={label}
                    selected={mealKind === value}
                    onPress={() => setMealKind(value)}
                  />
                ))}
              </View>
              <Text style={[styles.label, { color: colors.textSecondary }]}>RATION</Text>
              <View style={styles.row}>
                {MEAL_FRACTIONS.map(({ value, label }) => (
                  <Chip
                    key={value}
                    label={label}
                    selected={fraction === value}
                    onPress={() => setFraction(value)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {activity?.kind === 'walk' ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                PENDANT LA SORTIE ?
              </Text>
              <View style={styles.row}>
                <Chip
                  big
                  emoji="💩"
                  emojiSize={15}
                  selected={poopSmall}
                  onPress={() => setPoopSmall((v) => !v)}
                />
                <Chip
                  big
                  emoji="💩"
                  emojiSize={26}
                  selected={poopBig}
                  onPress={() => setPoopBig((v) => !v)}
                />
                <Chip big emoji="🐕" selected={offLeash} onPress={() => setOffLeash((v) => !v)} />
              </View>
            </>
          ) : null}

          {activity?.kind === 'fake_cue' ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                ON A JOUÉ AVEC QUOI ?
              </Text>
              {[0, 3].map((i) => (
                <View key={i} style={styles.row}>
                  {CUES.slice(i, i + 3).map(({ value, emoji, label }) => (
                    <Chip
                      key={value}
                      big
                      emoji={emoji}
                      label={label}
                      selected={cues.includes(value)}
                      onPress={() =>
                        setCues((prev) =>
                          prev.includes(value)
                            ? prev.filter((c) => c !== value)
                            : [...prev, value]
                        )
                      }
                    />
                  ))}
                </View>
              ))}
            </>
          ) : null}

          {activity?.kind === 'care' ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>QUI LE GARDE ?</Text>
              <TextInput
                value={caregiver}
                onChangeText={setCaregiver}
                placeholder="Nom de la personne"
                placeholderTextColor={colors.textSecondary}
                style={[
                  styles.input,
                  { backgroundColor: colors.card, borderColor: colors.border, color: colors.text },
                ]}
              />
              <Text style={[styles.label, { color: colors.textSecondary }]}>COMBIEN DE TEMPS ?</Text>
              {[0, 3].map((i) => (
                <View key={i} style={styles.row}>
                  {CARE_DURATIONS.slice(i, i + 3).map(({ minutes, label }) => (
                    <Chip
                      key={minutes}
                      label={label}
                      selected={careMinutes === minutes}
                      onPress={() => setCareMinutes(minutes)}
                    />
                  ))}
                </View>
              ))}
            </>
          ) : null}

          {kind === 'night' && night ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>OÙ A-T-IL DORMI ?</Text>
              {LOCATIONS.map(({ value, emoji, label }) => (
                <Pressable
                  key={value}
                  onPress={() => setLocation(value)}
                  style={[
                    styles.option,
                    {
                      backgroundColor: location === value ? colors.accent : colors.card,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Text style={styles.optionEmoji}>{emoji}</Text>
                  <Text
                    style={[
                      styles.optionText,
                      { color: location === value ? colors.accentText : colors.text },
                    ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
              {night.basket_x != null && night.basket_y != null ? (
                <>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    POSITION DU PANIER
                    {night.basket_space ? ` · ${SPACE_LABELS[night.basket_space]}` : ''}
                  </Text>
                  <MapFocus
                    center={{ x: Number(night.basket_x), y: Number(night.basket_y) }}
                    night={scheme === 'dark'}
                  />
                </>
              ) : null}
            </>
          ) : null}

          {kind === 'overall' && overall ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>
                TAPIS : {SPACE_LABELS[overall.mat_space]}
              </Text>
              <Text style={[styles.label, { color: colors.textSecondary }]}>DURÉE (MIN)</Text>
              <View style={styles.row}>
                {DURATIONS.map((d) => (
                  <Chip
                    key={d}
                    label={String(d)}
                    selected={duration === d}
                    onPress={() => setDuration(d)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {/* ------------------------------------------------------ Notes */}
          <Text style={[styles.label, { color: colors.textSecondary }]}>NOTES</Text>
          <DialogNotes value={notes} onChangeText={setNotes} />

          {/* ---------------------------------------------------- Actions */}
          <View style={styles.buttons}>
            <Pressable
              onPress={remove}
              style={[styles.button, { backgroundColor: colors.danger, borderColor: colors.border }]}>
              <Text style={[styles.buttonText, { color: colors.accentText }]}>SUPPRIMER</Text>
            </Pressable>
            <Pressable
              onPress={save}
              style={[styles.button, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Text style={[styles.buttonText, { color: colors.accentText }]}>ENREGISTRER</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: 48,
  },
  title: {
    fontSize: 13,
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: 8,
    marginTop: 4,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  timeCol: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  input: {
    borderWidth: 2,
    borderRadius: 2,
    padding: Spacing.sm,
    fontSize: 9,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
  },
  optionEmoji: {
    fontSize: 14,
  },
  optionText: {
    fontSize: 8,
    lineHeight: 12,
    flexShrink: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  button: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 9,
  },
});
