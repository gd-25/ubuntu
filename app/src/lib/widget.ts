import { Platform } from 'react-native';

/**
 * Synchronisation du widget iOS (écran verrouillé) : l'état de session est
 * écrit dans l'app group partagé, le widget le lit dans sa timeline.
 * Le module natif n'existe que dans les builds (pas dans Expo Go) — tout
 * est donc best-effort derrière des try/catch.
 */
const APP_GROUP = 'group.com.gregdeshusses.ubuntu';

interface WidgetState {
  /** Début de la session SOLO en cours (null si aucune). */
  sessionStartedAt: string | null;
  /** Minutes de solitude cumulées aujourd'hui et objectif du jour. */
  soloMinutes: number;
  soloGoal: number;
}

let storage: { set: (key: string, value: number) => void } | null = null;
let reload: (() => void) | null = null;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExtensionStorage } = require('@bacons/apple-targets');
    storage = new ExtensionStorage(APP_GROUP);
    reload = () => ExtensionStorage.reloadWidget();
  } catch {
    // Expo Go : pas de module natif, le widget n'existe pas de toute façon.
  }
}

/** Pousse l'état courant vers le widget et le recharge. */
export function syncWidget(state: WidgetState): void {
  if (!storage) return;
  try {
    storage.set(
      'sessionStartedAt',
      state.sessionStartedAt ? new Date(state.sessionStartedAt).getTime() / 1000 : 0
    );
    storage.set('soloMinutes', Math.round(state.soloMinutes));
    storage.set('soloGoal', Math.round(state.soloGoal));
    reload?.();
  } catch (error) {
    console.warn('Sync du widget impossible :', error);
  }
}
