import { Questrial_400Regular, useFonts } from '@expo-google-fonts/questrial';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth-context';
// Side effect: installs the foreground notification handler.
import '@/lib/notifications';
import { createSessionFromUrl } from '@/lib/supabase';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { session, isLoading } = useAuth();
  const url = Linking.useURL();
  const [fontsLoaded] = useFonts({ Questrial_400Regular });

  // Handle the magic-link deep link (ubuntu://... with tokens in the fragment).
  useEffect(() => {
    if (!url) return;
    createSessionFromUrl(url).catch((error) => {
      console.warn('Échec de la connexion via le lien magique :', error);
    });
  }, [url]);

  const isReady = !isLoading && fontsLoaded;

  useEffect(() => {
    if (isReady) SplashScreen.hideAsync();
  }, [isReady]);

  if (!isReady) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerTitleStyle: { fontFamily: 'Questrial_400Regular', fontSize: 17 },
          headerBackTitleStyle: { fontFamily: 'Questrial_400Regular' },
        }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="session/[id]" options={{ title: 'Détail de la session' }} />
          <Stack.Screen
            name="activity-log"
            options={{
              headerShown: false,
              presentation: 'formSheet',
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.75, 1],
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
