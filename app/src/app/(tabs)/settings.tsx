import { Check, Plus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Text, TextInput } from '@/components/text';
import { StatusBadge, type AgentDisplayStatus } from '@/components/status-badge';
import { Button, Card, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatDateTime, formatTime, secondsSince } from '@/lib/format';
import { DEFAULT_GOALS, fetchGoals, saveGoals } from '@/lib/goals';
import { registerForPushNotifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { AgentHeartbeat, AppImprovement, Tag } from '@/lib/types';
import { useDog } from '@/lib/use-dog';

const HEARTBEAT_FRESH_SECONDS = 120;

export default function SettingsScreen() {
  const colors = useTheme();
  const { user, signOut } = useAuth();
  const { dog, saveName } = useDog();

  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<AgentHeartbeat | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [improvements, setImprovements] = useState<AppImprovement[]>([]);
  const [improvementText, setImprovementText] = useState('');
  const [isSavingImprovement, setIsSavingImprovement] = useState(false);
  /** Objectifs quotidiens, édités en texte (validés à l'enregistrement). */
  const [goalInputs, setGoalInputs] = useState({
    cues: String(DEFAULT_GOALS.cues),
    overalls: String(DEFAULT_GOALS.overalls),
    semiSoloMinutes: String(DEFAULT_GOALS.semiSoloMinutes),
    soloMinutes: String(DEFAULT_GOALS.soloMinutes),
  });
  const [isSavingGoals, setIsSavingGoals] = useState(false);

  // Sync the input with the loaded dog name (state adjusted during render,
  // see https://react.dev/learn/you-might-not-need-an-effect).
  const [prevDog, setPrevDog] = useState(dog);
  if (dog !== prevDog) {
    setPrevDog(dog);
    setNameInput(dog?.name ?? '');
  }

  const fetchHeartbeat = useCallback(async (): Promise<AgentHeartbeat | null> => {
    if (!dog) return null;
    const { data, error } = await supabase
      .from('agent_heartbeats')
      .select('*')
      .eq('dog_id', dog.id)
      .order('at', { ascending: false })
      .limit(1);
    if (error) console.warn('Chargement du dernier signal impossible :', error.message);
    return (data?.[0] as AgentHeartbeat | undefined) ?? null;
  }, [dog]);

  useEffect(() => {
    let ignore = false;
    fetchHeartbeat().then((heartbeat) => {
      if (!ignore) setLastHeartbeat(heartbeat);
    });
    return () => {
      ignore = true;
    };
  }, [fetchHeartbeat]);

  const loadHeartbeat = useCallback(async () => {
    setLastHeartbeat(await fetchHeartbeat());
  }, [fetchHeartbeat]);

  // Particularités de session (liste par chien).
  useEffect(() => {
    if (!dog) return;
    let ignore = false;
    supabase
      .from('tags')
      .select('*')
      .eq('dog_id', dog.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.warn('Chargement des particularités impossible :', error.message);
        if (!ignore) setTags((data as Tag[] | null) ?? []);
      });
    return () => {
      ignore = true;
    };
  }, [dog]);

  // Objectifs quotidiens (table dog_goals, valeurs par défaut sinon).
  useEffect(() => {
    if (!dog) return;
    let ignore = false;
    fetchGoals(dog.id).then((goals) => {
      if (ignore) return;
      setGoalInputs({
        cues: String(goals.cues),
        overalls: String(goals.overalls),
        semiSoloMinutes: String(goals.semiSoloMinutes),
        soloMinutes: String(goals.soloMinutes),
      });
    });
    return () => {
      ignore = true;
    };
  }, [dog]);

  const onSaveGoals = async () => {
    if (!dog) return;
    const parse = (raw: string, fallback: number) => {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const goals = {
      cues: parse(goalInputs.cues, DEFAULT_GOALS.cues),
      overalls: parse(goalInputs.overalls, DEFAULT_GOALS.overalls),
      semiSoloMinutes: parse(goalInputs.semiSoloMinutes, DEFAULT_GOALS.semiSoloMinutes),
      soloMinutes: parse(goalInputs.soloMinutes, DEFAULT_GOALS.soloMinutes),
    };
    setIsSavingGoals(true);
    const errorMessage = await saveGoals(dog.id, goals);
    setIsSavingGoals(false);
    if (errorMessage) {
      Alert.alert('Erreur', `Objectifs non enregistrés : ${errorMessage}`);
      return;
    }
    setGoalInputs({
      cues: String(goals.cues),
      overalls: String(goals.overalls),
      semiSoloMinutes: String(goals.semiSoloMinutes),
      soloMinutes: String(goals.soloMinutes),
    });
    Alert.alert('Enregistré', 'Les objectifs quotidiens sont à jour.');
  };

  // Idées d'amélioration de l'app (simple stockage en base).
  useEffect(() => {
    if (!dog) return;
    let ignore = false;
    supabase
      .from('app_improvements')
      .select('*')
      .eq('dog_id', dog.id)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (error) console.warn('Chargement des améliorations impossible :', error.message);
        if (!ignore) setImprovements((data as AppImprovement[] | null) ?? []);
      });
    return () => {
      ignore = true;
    };
  }, [dog]);

  const addImprovement = async () => {
    if (!dog) return;
    const content = improvementText.trim();
    if (!content) return;
    setIsSavingImprovement(true);
    const { data, error } = await supabase
      .from('app_improvements')
      .insert({ dog_id: dog.id, content })
      .select()
      .single();
    setIsSavingImprovement(false);
    if (error) {
      Alert.alert('Erreur', `Note non enregistrée : ${error.message}`);
      return;
    }
    setImprovements((prev) => [data as AppImprovement, ...prev]);
    setImprovementText('');
  };

  const removeImprovement = (item: AppImprovement) => {
    Alert.alert('Supprimer cette note ?', item.content, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('app_improvements').delete().eq('id', item.id);
          if (error) {
            Alert.alert('Erreur', `Suppression impossible : ${error.message}`);
            return;
          }
          setImprovements((prev) => prev.filter((i) => i.id !== item.id));
        },
      },
    ]);
  };

  const addTag = async () => {
    if (!dog) return;
    const label = newTagLabel.trim();
    if (!label) return;
    setIsAddingTag(true);
    const { data, error } = await supabase
      .from('tags')
      .insert({ dog_id: dog.id, label })
      .select()
      .single();
    setIsAddingTag(false);
    if (error) {
      const isDuplicate = error.code === '23505';
      Alert.alert(
        'Erreur',
        isDuplicate ? 'Cette particularité existe déjà.' : `Ajout impossible : ${error.message}`
      );
      return;
    }
    setTags((prev) => [...prev, data as Tag]);
    setNewTagLabel('');
  };

  const removeTag = (tag: Tag) => {
    Alert.alert('Supprimer ?', `« ${tag.label} » sera retirée de toutes les sessions.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('tags').delete().eq('id', tag.id);
          if (error) {
            Alert.alert('Erreur', `Suppression impossible : ${error.message}`);
            return;
          }
          setTags((prev) => prev.filter((t) => t.id !== tag.id));
        },
      },
    ]);
  };

  const onSaveName = async () => {
    setIsSavingName(true);
    try {
      await saveName(nameInput);
      Alert.alert('Enregistré', dog ? 'Nom du chien mis à jour.' : 'Profil du chien créé.');
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Échec de l’enregistrement.');
    } finally {
      setIsSavingName(false);
    }
  };

  const onRegisterPush = async () => {
    if (!user) return;
    setIsRegisteringPush(true);
    try {
      const token = await registerForPushNotifications(user.id);
      setPushToken(token);
      Alert.alert('Notifications activées', 'Vous recevrez une alerte quand votre chien vocalise.');
    } catch (error) {
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Échec de l’activation.');
    } finally {
      setIsRegisteringPush(false);
    }
  };

  const agentStatus: AgentDisplayStatus = !lastHeartbeat
    ? 'unknown'
    : secondsSince(lastHeartbeat.at) > HEARTBEAT_FRESH_SECONDS
      ? 'stale'
      : lastHeartbeat.status;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* Titre fixe, même composant que le Journal. */}
      <View style={styles.titleWrap}>
        <ScreenTitle title="RÉGLAGES" />
      </View>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled">
      <Card>
        <SectionTitle>Mon chien</SectionTitle>
        <TextInput
          style={[
            styles.input,
            { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
          ]}
          placeholder="Nom du chien"
          placeholderTextColor={colors.textSecondary}
          value={nameInput}
          onChangeText={setNameInput}
        />
        <Button
          label={dog ? 'Renommer' : 'Créer le profil'}
          onPress={onSaveName}
          loading={isSavingName}
          disabled={!nameInput.trim()}
        />
      </Card>

      {dog ? (
        <Card>
          <SectionTitle>Particularités de session</SectionTitle>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Ce que vous avez fait de particulier avant/pendant une absence — à cocher ensuite dans
            le détail d&apos;une session.
          </Text>
          {tags.map((tag) => (
            <View key={tag.id} style={styles.tagRow}>
              <Text style={[styles.body, { color: colors.text, flex: 1 }]}>{tag.label}</Text>
              <Pressable onPress={() => removeTag(tag)} hitSlop={8}>
                <X size={18} color={colors.danger} />
              </Pressable>
            </View>
          ))}
          <View style={styles.addTagRow}>
            <TextInput
              style={[
                styles.input,
                styles.addTagInput,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              placeholder="Nouvelle particularité…"
              placeholderTextColor={colors.textSecondary}
              value={newTagLabel}
              onChangeText={setNewTagLabel}
              onSubmitEditing={addTag}
              returnKeyType="done"
            />
            <Pressable
              onPress={addTag}
              disabled={isAddingTag || !newTagLabel.trim()}
              style={[
                styles.addTagButton,
                { backgroundColor: colors.accent, opacity: isAddingTag || !newTagLabel.trim() ? 0.5 : 1 },
              ]}>
              <Plus size={20} color={colors.accentText} />
            </Pressable>
          </View>
        </Card>
      ) : null}

      {dog ? (
        <Card>
          <SectionTitle>Objectifs quotidiens</SectionTitle>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Les objectifs affichés sur les boutons de l&apos;accueil.
          </Text>
          <GoalRow
            label="Faux signaux (par jour)"
            value={goalInputs.cues}
            onChange={(v) => setGoalInputs((prev) => ({ ...prev, cues: v }))}
          />
          <GoalRow
            label="Exercices (par jour)"
            value={goalInputs.overalls}
            onChange={(v) => setGoalInputs((prev) => ({ ...prev, overalls: v }))}
          />
          <GoalRow
            label="Semi solo (min par jour)"
            value={goalInputs.semiSoloMinutes}
            onChange={(v) => setGoalInputs((prev) => ({ ...prev, semiSoloMinutes: v }))}
          />
          <GoalRow
            label="Solo (min par jour)"
            value={goalInputs.soloMinutes}
            onChange={(v) => setGoalInputs((prev) => ({ ...prev, soloMinutes: v }))}
          />
          <Button label="Enregistrer les objectifs" onPress={onSaveGoals} loading={isSavingGoals} />
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Notifications push</SectionTitle>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Recevez une alerte sur ce téléphone quand une vocalise est détectée pendant une session.
        </Text>
        {pushToken ? (
          <View style={styles.confirmRow}>
            <Check size={16} color={colors.success} />
            <Text style={[styles.body, { color: colors.success }]}>
              Notifications activées sur cet appareil.
            </Text>
          </View>
        ) : null}
        <Button
          label={pushToken ? 'Réenregistrer cet appareil' : 'Activer les notifications'}
          onPress={onRegisterPush}
          loading={isRegisteringPush}
        />
      </Card>

      <Card>
        <SectionTitle>Agent d’écoute</SectionTitle>
        <StatusBadge status={agentStatus} />
        {lastHeartbeat ? (
          <View style={styles.agentInfo}>
            <InfoRow label="Dernier signal" value={formatDateTime(lastHeartbeat.at)} />
            <InfoRow label="Niveau sonore (RMS)" value={lastHeartbeat.rms_level.toFixed(3)} />
          </View>
        ) : (
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Aucun signal reçu de l’agent pour le moment.
          </Text>
        )}
        <Button label="Actualiser" variant="secondary" onPress={loadHeartbeat} />
      </Card>

      {dog ? (
        <Card>
          <SectionTitle>Améliorations de l&apos;app</SectionTitle>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            Une idée, un truc qui agace ? Notez-la ici — elle est juste stockée pour les
            prochaines évolutions.
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.improvementInput,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
            ]}
            placeholder="Ex. Le bouton SOLO est trop petit…"
            placeholderTextColor={colors.textSecondary}
            value={improvementText}
            onChangeText={setImprovementText}
            multiline
            returnKeyType="done"
            submitBehavior="blurAndSubmit"
          />
          <Button
            label="Enregistrer la note"
            onPress={addImprovement}
            loading={isSavingImprovement}
            disabled={!improvementText.trim()}
          />
          {improvements.map((item) => (
            <View key={item.id} style={styles.tagRow}>
              <Text style={[styles.body, { color: colors.text, flex: 1 }]}>
                {item.content}
                <Text style={[styles.improvementDate, { color: colors.textSecondary }]}>
                  {'  '}· {formatDate(item.created_at)} {formatTime(item.created_at)}
                </Text>
              </Text>
              <Pressable onPress={() => removeImprovement(item)} hitSlop={8}>
                <X size={14} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Compte</SectionTitle>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Connecté en tant que {user?.email ?? '—'}
        </Text>
        <Button label="Se déconnecter" variant="danger" onPress={signOut} />
      </Card>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.body, { color: colors.text, fontWeight: '600' }]}>{value}</Text>
    </View>
  );
}

/** Ligne objectif : libellé à gauche, petit champ numérique à droite. */
function GoalRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const colors = useTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.body, { color: colors.text, flex: 1 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        returnKeyType="done"
        style={[
          styles.goalInput,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  titleWrap: {
    paddingHorizontal: Spacing.md,
  },
  content: {
    padding: Spacing.md,
    paddingTop: Spacing.xs,
    gap: Spacing.md,
    paddingBottom: 112,
  },
  // Typo alignée sur le Journal et les bottom sheets (police pixel : 8-9).
  input: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 9,
  },
  improvementInput: {
    minHeight: 52,
    lineHeight: 14,
  },
  improvementDate: {
    fontSize: 6.5,
  },
  body: {
    fontSize: 8,
    lineHeight: 13,
  },
  agentInfo: {
    gap: 6,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  goalInput: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 9,
    minWidth: 56,
    textAlign: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  addTagRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  addTagInput: {
    flex: 1,
  },
  addTagButton: {
    borderRadius: 2,
    padding: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
