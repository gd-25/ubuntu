import { Dog } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const colors = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage('Saisissez votre adresse e-mail.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Le mot de passe doit faire au moins 6 caractères.');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: trimmedEmail, password })
        : await supabase.auth.signUp({ email: trimmedEmail, password });

    setIsSubmitting(false);
    if (error) {
      setErrorMessage(translateAuthError(error.message));
    }
    // On success the auth listener redirects to the tabs automatically.
  };

  const toggleMode = () => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setErrorMessage(null);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <View style={styles.logo}>
            <Dog size={56} color={colors.accent} strokeWidth={1.6} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>UBUNTU</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Surveillez votre chien quand il est seul à la maison
          </Text>

          <Card style={styles.card}>
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
            />
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.background },
              ]}
              placeholder="Mot de passe"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
            {errorMessage ? (
              <Text style={[styles.error, { color: colors.danger }]}>{errorMessage}</Text>
            ) : null}
            <Button
              label={mode === 'signin' ? 'Se connecter' : 'Créer le compte'}
              onPress={submit}
              loading={isSubmitting}
            />
            <Pressable onPress={toggleMode} hitSlop={8}>
              <Text style={[styles.switchMode, { color: colors.accent }]}>
                {mode === 'signin'
                  ? 'Pas encore de compte ? Créez-en un'
                  : 'Déjà un compte ? Connectez-vous'}
              </Text>
            </Pressable>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'E-mail ou mot de passe incorrect.';
  if (/already registered/i.test(message)) return 'Un compte existe déjà avec cet e-mail.';
  if (/at least 6 characters/i.test(message)) return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/rate limit|too many/i.test(message)) return 'Trop de tentatives, réessayez dans un instant.';
  return message;
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
    alignItems: 'center',
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
  switchMode: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
