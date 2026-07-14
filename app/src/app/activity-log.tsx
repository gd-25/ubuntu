import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Button, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import type { ActivityKind } from '@/lib/types';
import { useDog } from '@/lib/use-dog';

const KINDS: { kind: ActivityKind; label: string }[] = [
  { kind: 'walk', label: '🚶 Sortie' },
  { kind: 'meal', label: '🍽️ Repas' },
  { kind: 'play', label: '🎾 Jeu' },
  { kind: 'other', label: '📝 Autre' },
];

const TIME_OFFSETS: { minutes: number; label: string }[] = [
  { minutes: 0, label: 'Maintenant' },
  { minutes: 15, label: 'Il y a 15 min' },
  { minutes: 30, label: 'Il y a 30 min' },
  { minutes: 60, label: 'Il y a 1 h' },
  { minutes: 120, label: 'Il y a 2 h' },
];

type Mode = 'activity' | 'session';

export default function ActivityLogScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { dog } = useDog();

  const [mode, setMode] = useState<Mode>('activity');
  const [kind, setKind] = useState<ActivityKind>('walk');
  const [offsetMinutes, setOffsetMinutes] = useState(0);
  const [notes, setNotes] = useState('');
  const [sessionStart, setSessionStart] = useState('');
  const [sessionEnd, setSessionEnd] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const saveActivity = async () => {
    if (!dog) return;
    setIsSaving(true);
    const at = new Date(Date.now() - offsetMinutes * 60_000).toISOString();
    const { error } = await supabase
      .from('activities')
      .insert({ dog_id: dog.id, kind, at, notes: notes.trim() || null });
    setIsSaving(false);
    if (error) {
      Alert.alert('Erreur', `Impossible d'enregistrer : ${error.message}`);
      return;
    }
    router.back();
  };

  /** "14:30" (aujourd'hui, heure locale) → Date, ou null si invalide. */
  const parseTodayTime = (value: string): Date | null => {
    const match = value.trim().match(/^(\d{1,2})[h:](\d{2})$/i);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const saveSession = async () => {
    if (!dog) return;
    const start = parseTodayTime(sessionStart);
    const end = parseTodayTime(sessionEnd);
    if (!start || !end) {
      Alert.alert('Format invalide', 'Entrez les heures au format 14:30 (aujourd’hui).');
      return;
    }
    if (end <= start || end > new Date()) {
      Alert.alert('Heures invalides', 'La fin doit être après le début, et dans le passé.');
      return;
    }
    setIsSaving(true);
    // Le trigger Postgres rattache automatiquement les épisodes de la plage.
    const { error } = await supabase.from('sessions').insert({
      dog_id: dog.id,
      trigger: 'manual',
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      notes: notes.trim() || null,
    });
    setIsSaving(false);
    if (error) {
      Alert.alert('Erreur', `Impossible d'enregistrer : ${error.message}`);
      return;
    }
    router.back();
  };

  const chipStyle = (active: boolean) => [
    styles.chip,
    {
      backgroundColor: active ? colors.accent : colors.card,
      borderColor: active ? colors.accent : colors.border,
    },
  ];
  const chipTextStyle = (active: boolean) => [
    styles.chipText,
    { color: active ? colors.accentText : colors.text },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <View style={styles.grabberSpace} />
      <Text style={[styles.title, { color: colors.text }]}>Enregistrer une activité</Text>

      <View style={styles.chipRow}>
        <Pressable style={chipStyle(mode === 'activity')} onPress={() => setMode('activity')}>
          <Text style={chipTextStyle(mode === 'activity')}>Activité</Text>
        </Pressable>
        <Pressable style={chipStyle(mode === 'session')} onPress={() => setMode('session')}>
          <Text style={chipTextStyle(mode === 'session')}>Session oubliée</Text>
        </Pressable>
      </View>

      {mode === 'activity' ? (
        <>
          <SectionTitle>Type</SectionTitle>
          <View style={styles.chipRow}>
            {KINDS.map(({ kind: k, label }) => (
              <Pressable key={k} style={chipStyle(kind === k)} onPress={() => setKind(k)}>
                <Text style={chipTextStyle(kind === k)}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <SectionTitle>Quand ?</SectionTitle>
          <View style={styles.chipRow}>
            {TIME_OFFSETS.map(({ minutes, label }) => (
              <Pressable
                key={minutes}
                style={chipStyle(offsetMinutes === minutes)}
                onPress={() => setOffsetMinutes(minutes)}>
                <Text style={chipTextStyle(offsetMinutes === minutes)}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.help, { color: colors.textSecondary }]}>
            Vous êtes sorti sans lancer de session ? Saisissez ses horaires (aujourd&apos;hui) :
            les vocalises détectées pendant cette plage y seront rattachées automatiquement.
          </Text>
          <View style={styles.timeRow}>
            <View style={styles.timeField}>
              <SectionTitle>Début</SectionTitle>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="14:30"
                placeholderTextColor={colors.textSecondary}
                value={sessionStart}
                onChangeText={setSessionStart}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            </View>
            <View style={styles.timeField}>
              <SectionTitle>Fin</SectionTitle>
              <TextInput
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                placeholder="16:45"
                placeholderTextColor={colors.textSecondary}
                value={sessionEnd}
                onChangeText={setSessionEnd}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            </View>
          </View>
        </>
      )}

      <SectionTitle>Notes (optionnel)</SectionTitle>
      <TextInput
        style={[styles.input, styles.notes, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
        placeholder={mode === 'activity' ? 'Grande balade au parc…' : 'Courses, rendez-vous…'}
        placeholderTextColor={colors.textSecondary}
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <Button
        label="Enregistrer"
        onPress={mode === 'activity' ? saveActivity : saveSession}
        disabled={!dog}
        loading={isSaving}
      />
      <Button label="Annuler" variant="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  grabberSpace: {
    height: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  help: {
    fontSize: 14,
    lineHeight: 20,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  timeField: {
    flex: 1,
    gap: Spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  notes: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
