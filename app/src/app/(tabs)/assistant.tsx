import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ScreenTitle } from '@/components/screen-title';
import { Text } from '@/components/text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { AssistantConversation } from '@/lib/types';
import { useDog } from '@/lib/use-dog';

/**
 * L'EXPERT : liste des conversations avec l'assistant IA (partagées entre
 * Greg et Fiona), accès à la bibliothèque RAG et à la fiche d'Ubuntu.
 */
export default function AssistantScreen() {
  const colors = useTheme();
  const router = useRouter();
  const { dog } = useDog();
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!dog) return;
    const { data, error } = await supabase
      .from('assistant_conversations')
      .select('*')
      .eq('dog_id', dog.id)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (!error) setConversations((data as AssistantConversation[]) ?? []);
    setIsLoading(false);
  }, [dog]);

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations])
  );

  const deleteConversation = (conversation: AssistantConversation) => {
    Alert.alert('Supprimer ?', conversation.title ?? 'Conversation sans titre', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('assistant_conversations').delete().eq('id', conversation.id);
          fetchConversations();
        },
      },
    ]);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenTitle title="L'EXPERT" subtitle="Éducateur canin spécialisé solitude" />
            <Button label="💬 Nouvelle conversation" onPress={() => router.push('/chat/new')} />
            <View style={styles.shortcuts}>
              <Shortcut
                emoji="📚"
                label="BIBLIOTHÈQUE"
                onPress={() => router.push('/library')}
              />
              <Shortcut
                emoji="🐶"
                label={`FICHE ${dog?.name?.toUpperCase() ?? ''}`}
                onPress={() => router.push('/dog-profile')}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              title="Aucune conversation"
              subtitle="Raconte-lui une balade, demande-lui d'analyser une session, ou pose une question d'éducation."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
            onLongPress={() => deleteConversation(item)}>
            <Card style={styles.row}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>
                {item.title ?? 'Conversation'}
              </Text>
              <Text style={[styles.rowDate, { color: colors.textSecondary }]}>
                {formatDateTime(item.updated_at)}
                {item.created_by ? `  ·  ${item.created_by === 'fiona' ? 'Fiona' : 'Greg'}` : ''}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

function Shortcut({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  const colors = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.shortcut}>
      <Card style={styles.shortcutCard}>
        <Text style={styles.shortcutEmoji}>{emoji}</Text>
        <Text numberOfLines={1} style={[styles.shortcutLabel, { color: colors.text }]}>
          {label}
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  header: {
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  shortcut: {
    flex: 1,
  },
  shortcutCard: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
  },
  shortcutEmoji: {
    fontSize: 18,
  },
  shortcutLabel: {
    fontSize: 8,
  },
  row: {
    gap: 4,
  },
  rowTitle: {
    fontSize: 10,
    lineHeight: 15,
  },
  rowDate: {
    fontSize: 8,
  },
});
