import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Button, Card, EmptyState, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ingestUrl, reingestDocument } from '@/lib/assistant';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { LibraryDocument } from '@/lib/types';
import { useDog } from '@/lib/use-dog';

const STATUS_LABELS: Record<LibraryDocument['status'], string> = {
  pending: '⏳ en attente',
  processing: '⚙️ indexation…',
  ready: '✅ indexé',
  error: '❌ erreur',
};

/**
 * Bibliothèque de l'expert : les ressources (articles, PDF en ligne) que
 * l'assistant peut citer via sa recherche sémantique. Ajout par URL — le
 * téléchargement et l'indexation se font côté serveur.
 */
export default function LibraryScreen() {
  const colors = useTheme();
  const { dog } = useDog();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchDocuments = useCallback(async () => {
    if (!dog) return;
    const { data } = await supabase
      .from('library_documents')
      .select('*')
      .eq('dog_id', dog.id)
      .order('created_at', { ascending: false });
    setDocuments((data as LibraryDocument[]) ?? []);
  }, [dog]);

  useFocusEffect(
    useCallback(() => {
      fetchDocuments();
    }, [fetchDocuments])
  );

  const addDocument = async () => {
    if (!dog) return;
    const cleanUrl = url.trim();
    if (!/^https?:\/\/.+/.test(cleanUrl)) {
      Alert.alert('Bibliothèque', 'Entre une URL complète (https://…).');
      return;
    }
    setIsAdding(true);
    try {
      await ingestUrl(dog.id, cleanUrl, title.trim());
      setUrl('');
      setTitle('');
    } catch (error) {
      Alert.alert('Bibliothèque', error instanceof Error ? error.message : 'Ajout impossible');
    }
    setIsAdding(false);
    fetchDocuments();
  };

  const retry = async (doc: LibraryDocument) => {
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status: 'processing' as const } : d))
    );
    try {
      await reingestDocument(doc.id);
    } catch (error) {
      Alert.alert('Bibliothèque', error instanceof Error ? error.message : 'Indexation impossible');
    }
    fetchDocuments();
  };

  const remove = (doc: LibraryDocument) => {
    Alert.alert('Supprimer ?', doc.title, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await supabase.storage.from('library').remove([doc.storage_path]);
          await supabase.from('library_documents').delete().eq('id', doc.id);
          fetchDocuments();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: colors.text }]}>📚 BIBLIOTHÈQUE</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Les ressources que l&apos;expert peut citer : articles ou PDF accessibles par URL
        (anxiété de séparation, éducation, élevage…).
      </Text>

      <SectionTitle>Ajouter une ressource</SectionTitle>
      <Card style={styles.form}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://… (article ou PDF)"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
        />
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Titre (optionnel)"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
        />
        <Button label="Ajouter et indexer" onPress={addDocument} loading={isAdding} />
      </Card>

      <SectionTitle>Documents</SectionTitle>
      {documents.length === 0 ? (
        <EmptyState
          title="Bibliothèque vide"
          subtitle="Ajoute une première ressource : l'expert s'en servira pour appuyer ses conseils."
        />
      ) : (
        documents.map((doc) => (
          <Pressable key={doc.id} onLongPress={() => remove(doc)}>
            <Card style={styles.docRow}>
              <Text numberOfLines={2} style={[styles.docTitle, { color: colors.text }]}>
                {doc.title}
              </Text>
              <Text style={[styles.docMeta, { color: colors.textSecondary }]}>
                {STATUS_LABELS[doc.status]}
                {doc.status === 'ready' ? `  ·  ${doc.chunk_count} extraits` : ''}
                {'  ·  '}
                {formatDateTime(doc.created_at)}
              </Text>
              {doc.status === 'error' && doc.error ? (
                <Text style={[styles.docError, { color: colors.danger }]} numberOfLines={2}>
                  {doc.error}
                </Text>
              ) : null}
              {doc.status === 'error' || doc.status === 'pending' ? (
                <View style={styles.retryRow}>
                  <Button label="Réessayer" variant="secondary" onPress={() => retry(doc)} />
                </View>
              ) : null}
            </Card>
          </Pressable>
        ))
      )}
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Maintiens un document pour le supprimer.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: Spacing.xl * 2,
  },
  title: {
    fontSize: 14,
  },
  subtitle: {
    fontSize: 8,
    lineHeight: 13,
    marginBottom: Spacing.xs,
  },
  form: {
    gap: Spacing.sm,
  },
  input: {
    borderWidth: 3,
    borderRadius: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 12,
    fontSize: 9,
  },
  docRow: {
    gap: 4,
  },
  docTitle: {
    fontSize: 9,
    lineHeight: 14,
  },
  docMeta: {
    fontSize: 8,
  },
  docError: {
    fontSize: 8,
    lineHeight: 12,
  },
  retryRow: {
    marginTop: Spacing.xs,
  },
  hint: {
    fontSize: 7,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
