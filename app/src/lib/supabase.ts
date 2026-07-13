import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY manquantes. Copiez .env.example vers .env et remplissez-les.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // On native, the magic-link tokens are handled manually via the deep link.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// Keep the auth session refreshed while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
      return;
    }
    supabase.auth.stopAutoRefresh();
  });
}

/**
 * Creates a Supabase session from a magic-link redirect URL
 * (tokens arrive in the URL fragment: #access_token=...&refresh_token=...).
 * Returns true if a session was established.
 */
export async function createSessionFromUrl(url: string): Promise<boolean> {
  const params = parseUrlParams(url);

  const errorDescription = params.error_description;
  if (errorDescription) throw new Error(errorDescription);

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) return false;

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  return true;
}

function parseUrlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');

  const collect = (raw: string) => {
    for (const pair of raw.split('&')) {
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    }
  };

  if (queryStart >= 0) {
    const end = hashStart > queryStart ? hashStart : url.length;
    collect(url.slice(queryStart + 1, end));
  }
  if (hashStart >= 0) collect(url.slice(hashStart + 1));
  return out;
}
