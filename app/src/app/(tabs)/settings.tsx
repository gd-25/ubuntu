import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { StatusBadge, type AgentDisplayStatus } from '@/components/status-badge';
import { Button, Card, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { formatDateTime, secondsSince } from '@/lib/format';
import { registerForPushNotifications } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { AgentHeartbeat } from '@/lib/types';
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

  useEffect(() => {
    setNameInput(dog?.name ?? '');
  }, [dog]);

  const loadHeartbeat = useCallback(async () => {
    if (!dog) return;
    const { data } = await supabase
      .from('agent_heartbeats')
      .select('*')
      .eq('dog_id', dog.id)
      .order('at', { ascending: false })
      .limit(1);
    setLastHeartbeat((data?.[0] as AgentHeartbeat | undefined) ?? null);
  }, [dog]);

  useEffect(() => {
    loadHeartbeat();
  }, [loadHeartbeat]);

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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}>
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

      <Card>
        <SectionTitle>Notifications push</SectionTitle>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Recevez une alerte sur ce téléphone quand une vocalise est détectée pendant une session.
        </Text>
        {pushToken ? (
          <Text style={[styles.body, { color: colors.success }]}>
            ✓ Notifications activées sur cet appareil.
          </Text>
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

      <Card>
        <SectionTitle>Compte</SectionTitle>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Connecté en tant que {user?.email ?? '—'}
        </Text>
        <Button label="Se déconnecter" variant="danger" onPress={signOut} />
      </Card>
    </ScrollView>
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

const styles = StyleSheet.create({
  content: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  agentInfo: {
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
});
