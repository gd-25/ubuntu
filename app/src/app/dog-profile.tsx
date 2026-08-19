import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { AssistantProfile } from '@/lib/types';
import { useDog } from '@/lib/use-dog';

/**
 * La fiche du chien : le document de référence que l'expert garde toujours
 * en contexte. Il la maintient lui-même au fil des conversations
 * (tool update_profile) mais elle reste éditable à la main ici.
 */
export default function DogProfileScreen() {
  const colors = useTheme();
  const { dog, person } = useDog();
  const [content, setContent] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!dog) return;
    (async () => {
      const { data } = await supabase
        .from('assistant_profiles')
        .select('*')
        .eq('dog_id', dog.id)
        .maybeSingle();
      const profile = data as AssistantProfile | null;
      if (profile) {
        setContent(profile.content);
        setUpdatedAt(profile.updated_at);
      }
    })();
  }, [dog]);

  const save = async () => {
    if (!dog) return;
    setIsSaving(true);
    const { error } = await supabase.from('assistant_profiles').upsert({
      dog_id: dog.id,
      content: content.trim(),
      updated_by: person,
      updated_at: new Date().toISOString(),
    });
    setIsSaving(false);
    if (error) {
      Alert.alert('Fiche', `Sauvegarde impossible : ${error.message}`);
      return;
    }
    setUpdatedAt(new Date().toISOString());
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: colors.text }]}>
        🐶 FICHE {dog?.name?.toUpperCase() ?? ''}
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Le document que l&apos;expert garde toujours en tête : tempérament, historique,
        ce qui marche, ce qui coince. Il le met à jour tout seul, mais tu peux corriger ici.
      </Text>
      <TextInput
        value={content}
        onChangeText={setContent}
        multiline
        placeholder={`Ex. : ${dog?.name ?? 'Ubuntu'}, berger australien de 2 ans. Anxiété de séparation modérée, vocalise surtout les 10 premières minutes…`}
        placeholderTextColor={colors.textSecondary}
        style={[styles.editor, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
      />
      <Button label="Sauvegarder" onPress={save} loading={isSaving} />
      {updatedAt ? (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          Dernière mise à jour : {formatDateTime(updatedAt)}
        </Text>
      ) : null}
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
  },
  editor: {
    minHeight: 260,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.sm,
    fontSize: 9,
    lineHeight: 15,
    textAlignVertical: 'top',
  },
  meta: {
    fontSize: 7,
    textAlign: 'center',
  },
});
