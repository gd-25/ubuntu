import * as Linking from 'expo-linking';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sendMagicLink = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setErrorMessage('Saisissez votre adresse e-mail.');
      return;
    }
    setIsSending(true);
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: Linking.createURL('/') },
    });
    setIsSending(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    setSentTo(trimmed);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <Text style={styles.logo}>🐶</Text>
          <Text style={[styles.title, { color: colors.text }]}>UBUNTU</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Surveillez votre chien quand il est seul à la maison
          </Text>

          {sentTo ? (
            <Card style={styles.card}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>📬 Lien envoyé !</Text>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
                Un lien de connexion a été envoyé à {sentTo}. Ouvrez-le sur cet appareil pour vous
                connecter.
              </Text>
              <Button
                label="Renvoyer le lien"
                variant="secondary"
                onPress={sendMagicLink}
                loading={isSending}
              />
            </Card>
          ) : (
            <Card style={styles.card}>
              <Text style={[styles.cardBody, { color: colors.textSecondary }]}>
                Connexion par lien magique — aucun mot de passe requis.
              </Text>
              <TextInput
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
                ]}
                placeholder="votre@email.fr"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={sendMagicLink}
              />
              {errorMessage ? (
                <Text style={[styles.error, { color: colors.danger }]}>{errorMessage}</Text>
              ) : null}
              <Button label="Recevoir le lien de connexion" onPress={sendMagicLink} loading={isSending} />
            </Card>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  logo: {
    fontSize: 56,
    textAlign: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  card: {
    gap: Spacing.md,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    fontSize: 13,
  },
});
