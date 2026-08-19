import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  PROPOSAL_KIND_LABELS,
  confirmProposals,
  dismissProposals,
  streamChat,
  transcribeRecording,
} from '@/lib/assistant';
import { formatDateTime, formatTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { AssistantMessage, ProposalEntry } from '@/lib/types';
import { useDog } from '@/lib/use-dog';

/**
 * Conversation avec l'expert canin. `id` est une conversation existante ou
 * 'new' (créée par l'Edge Function au premier message). Le paramètre `ask`
 * pré-envoie une question (ex. « analyse cette session » depuis le détail
 * d'une session).
 */
export default function ChatScreen() {
  const colors = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, ask } = useLocalSearchParams<{ id: string; ask?: string }>();
  const { dog, person } = useDog();

  const [conversationId, setConversationId] = useState<string | null>(id === 'new' ? null : id);
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const autoAsked = useRef(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  // Conversation existante : historique + titre.
  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const [{ data: conv }, { data: msgs }] = await Promise.all([
        supabase.from('assistant_conversations').select('title').eq('id', conversationId).maybeSingle(),
        supabase
          .from('assistant_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(200),
      ]);
      if (conv?.title) setTitle(conv.title);
      if (msgs) setMessages(msgs as AssistantMessage[]);
    })();
    // Volontairement une seule fois : le fil vit ensuite en local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || !dog || isSending) return;
      setIsSending(true);
      setInput('');
      setDraft('');
      setStatusLabel(null);
      const localUserMessage: AssistantMessage = {
        id: `local-${Date.now()}`,
        conversation_id: conversationId ?? 'new',
        dog_id: dog.id,
        role: 'user',
        content: text,
        author: person,
        proposals: null,
        proposal_status: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, localUserMessage]);

      let streamed = '';
      try {
        await streamChat(
          { dogId: dog.id, conversationId, message: text, author: person },
          {
            onMeta: (meta) => setConversationId(meta.conversation_id),
            onStatus: (label) => setStatusLabel(label),
            onDelta: (chunk) => {
              streamed += chunk;
              setDraft(streamed);
              setStatusLabel(null);
            },
            onDone: (message) => {
              setMessages((prev) => [...prev, message]);
              setDraft('');
              setStatusLabel(null);
            },
            onError: (message) => {
              Alert.alert('Assistant', message);
              setDraft('');
              setStatusLabel(null);
              setInput(text);
            },
          }
        );
      } catch (error) {
        Alert.alert('Assistant', error instanceof Error ? error.message : 'Erreur réseau');
        setInput(text);
        setMessages((prev) => prev.filter((m) => m.id !== localUserMessage.id));
        setDraft('');
        setStatusLabel(null);
      }
      setIsSending(false);
    },
    [conversationId, dog, isSending, person]
  );

  // Question pré-remplie (« analyse cette session »), envoyée une seule fois.
  useEffect(() => {
    if (!ask || autoAsked.current || !dog || conversationId) return;
    autoAsked.current = true;
    send(ask);
  }, [ask, dog, conversationId, send]);

  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri) return;
      setIsTranscribing(true);
      try {
        const text = await transcribeRecording(recorder.uri);
        if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
      } catch (error) {
        Alert.alert('Dictée', error instanceof Error ? error.message : 'Transcription impossible');
      }
      setIsTranscribing(false);
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Dictée', 'Autorise le micro dans les réglages iOS pour dicter.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const updateMessage = (updated: AssistantMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  // FlatList inversée : données du plus récent au plus ancien, plus la bulle
  // de streaming et le statut d'outil en tête.
  const listData: ListItem[] = [];
  if (statusLabel) listData.push({ type: 'status', key: 'status', label: statusLabel });
  if (draft) listData.push({ type: 'draft', key: 'draft', text: draft });
  else if (isSending && !statusLabel) listData.push({ type: 'status', key: 'thinking', label: 'Réfléchit…' });
  for (let i = messages.length - 1; i >= 0; i--) {
    listData.push({ type: 'message', key: messages[i].id, message: messages[i] });
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.xs, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.back, { color: colors.accent }]}>‹ RETOUR</Text>
        </Pressable>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>
          {title ?? "🧠 L'EXPERT"}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          inverted
          data={listData}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.listContent}
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View style={styles.emptyWrapper}>
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                Raconte-moi la journée de {dog?.name ?? 'ton chien'}, demande-moi d&apos;analyser
                une session, ou pose une question d&apos;éducation. Ce que tu me confies, je le
                retiens.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.type === 'status') {
              return (
                <Text style={[styles.status, { color: colors.textSecondary }]}>⏳ {item.label}</Text>
              );
            }
            if (item.type === 'draft') {
              return <AssistantBubble content={item.text} />;
            }
            return <MessageRow message={item.message} onUpdated={updateMessage} />;
          }}
        />

        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, Spacing.sm),
            },
          ]}>
          <Pressable
            onPress={toggleRecording}
            disabled={isTranscribing}
            style={[
              styles.micButton,
              {
                borderColor: colors.border,
                backgroundColor: recorderState.isRecording ? colors.danger : colors.cardAlt,
              },
            ]}>
            {isTranscribing ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.micIcon}>{recorderState.isRecording ? '⏹' : '🎙️'}</Text>
            )}
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={recorderState.isRecording ? 'Enregistrement…' : 'Écris ou dicte…'}
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={isSending || !input.trim()}
            style={[
              styles.sendButton,
              {
                borderColor: colors.border,
                backgroundColor: colors.accent,
                opacity: isSending || !input.trim() ? 0.4 : 1,
              },
            ]}>
            <Text style={[styles.sendIcon, { color: colors.accentText }]}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

type ListItem =
  | { type: 'message'; key: string; message: AssistantMessage }
  | { type: 'draft'; key: string; text: string }
  | { type: 'status'; key: string; label: string };

function MessageRow({
  message,
  onUpdated,
}: {
  message: AssistantMessage;
  onUpdated: (message: AssistantMessage) => void;
}) {
  const colors = useTheme();
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={[styles.userBubble, { backgroundColor: colors.accent, borderColor: colors.border }]}>
          <Text style={[styles.bubbleText, { color: colors.accentText }]}>{message.content}</Text>
        </View>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {message.author === 'fiona' ? 'Fiona' : 'Greg'} · {formatTime(message.created_at)}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.assistantRow}>
      <AssistantBubble content={message.content} />
      {message.proposals?.length ? <ProposalCard message={message} onUpdated={onUpdated} /> : null}
    </View>
  );
}

function AssistantBubble({ content }: { content: string }) {
  const colors = useTheme();
  return (
    <View style={[styles.assistantBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.bubbleText, { color: colors.text }]}>{content.trim()}</Text>
    </View>
  );
}

/** Carte de validation des entrées proposées : c'est ici (et seulement ici)
 * que les données entrent réellement dans le journal. */
function ProposalCard({
  message,
  onUpdated,
}: {
  message: AssistantMessage;
  onUpdated: (message: AssistantMessage) => void;
}) {
  const colors = useTheme();
  const [isWorking, setIsWorking] = useState(false);
  const entries = message.proposals ?? [];

  const act = async (action: 'confirm' | 'dismiss') => {
    setIsWorking(true);
    try {
      if (action === 'confirm') await confirmProposals(message);
      else await dismissProposals(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onUpdated({
        ...message,
        proposal_status: action === 'confirm' ? 'confirmed' : 'dismissed',
      });
    } catch (error) {
      Alert.alert('Journal', error instanceof Error ? error.message : 'Enregistrement impossible');
    }
    setIsWorking(false);
  };

  return (
    <View style={[styles.proposalCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
      <Text style={[styles.proposalTitle, { color: colors.textSecondary }]}>
        📋 À ENREGISTRER DANS LE JOURNAL
      </Text>
      {entries.map((entry, index) => (
        <ProposalLine key={index} entry={entry} />
      ))}
      {message.proposal_status === 'pending' ? (
        <View style={styles.proposalButtons}>
          <Pressable
            onPress={() => act('dismiss')}
            disabled={isWorking}
            style={[styles.proposalButton, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.proposalButtonLabel, { color: colors.text }]}>IGNORER</Text>
          </Pressable>
          <Pressable
            onPress={() => act('confirm')}
            disabled={isWorking}
            style={[styles.proposalButton, { borderColor: colors.border, backgroundColor: colors.success }]}>
            {isWorking ? (
              <ActivityIndicator size="small" color={colors.accentText} />
            ) : (
              <Text style={[styles.proposalButtonLabel, { color: colors.accentText }]}>✔ VALIDER</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.proposalDone, { color: colors.textSecondary }]}>
          {message.proposal_status === 'confirmed' ? '✅ Enregistré dans le journal' : '✖ Ignoré'}
        </Text>
      )}
    </View>
  );
}

function ProposalLine({ entry }: { entry: ProposalEntry }) {
  const colors = useTheme();
  const details = [
    formatDateTime(entry.at),
    entry.ended_at ? `→ ${formatTime(entry.ended_at)}` : null,
    entry.duration_minutes ? `${entry.duration_minutes} min` : null,
    entry.commands?.length ? entry.commands.join(' + ') : null,
    entry.success_rating ? `réussite ${entry.success_rating}/5` : null,
    entry.weight_kg ? `${entry.weight_kg} kg` : null,
    entry.off_leash ? '🐕 liberté' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.proposalLine}>
      <Text style={[styles.proposalKind, { color: colors.text }]}>
        {PROPOSAL_KIND_LABELS[entry.kind] ?? entry.kind}
      </Text>
      <Text style={[styles.proposalDetail, { color: colors.textSecondary }]}>{details}</Text>
      {entry.notes ? (
        <Text style={[styles.proposalNotes, { color: colors.text }]}>{entry.notes}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 3,
  },
  back: {
    fontSize: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'right',
  },
  body: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  emptyWrapper: {
    // La liste est inversée : on remet l'état vide à l'endroit.
    transform: [{ scaleY: -1 }],
    paddingVertical: Spacing.lg,
  },
  empty: {
    fontSize: 9,
    lineHeight: 15,
    textAlign: 'center',
  },
  status: {
    fontSize: 8,
    paddingVertical: 2,
  },
  userRow: {
    alignItems: 'flex-end',
    gap: 3,
  },
  userBubble: {
    maxWidth: '85%',
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.sm,
  },
  assistantRow: {
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  assistantBubble: {
    maxWidth: '92%',
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.sm,
  },
  bubbleText: {
    fontSize: 9,
    lineHeight: 15,
  },
  meta: {
    fontSize: 7,
  },
  proposalCard: {
    alignSelf: 'stretch',
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  proposalTitle: {
    fontSize: 8,
  },
  proposalLine: {
    gap: 2,
  },
  proposalKind: {
    fontSize: 9,
  },
  proposalDetail: {
    fontSize: 8,
    lineHeight: 12,
  },
  proposalNotes: {
    fontSize: 8,
    lineHeight: 12,
  },
  proposalButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  proposalButton: {
    flex: 1,
    borderWidth: 3,
    borderRadius: 2,
    paddingVertical: 10,
    alignItems: 'center',
  },
  proposalButtonLabel: {
    fontSize: 9,
  },
  proposalDone: {
    fontSize: 8,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 3,
  },
  micButton: {
    width: 44,
    height: 44,
    borderWidth: 3,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIcon: {
    fontSize: 16,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 3,
    borderRadius: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 12,
    fontSize: 9,
    lineHeight: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderWidth: 3,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendIcon: {
    fontSize: 14,
  },
});
