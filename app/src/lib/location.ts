/**
 * Localisation des humains (Greg et Fiona) : une zone autour de
 * l'appartement, surveillée par le système (geofencing iOS).
 *
 * Deux usages :
 *  1. déplacer l'avatar de la personne sur le plan — dans l'appartement
 *     (salon) quand elle est chez elle, sur le sentier (dehors) sinon ;
 *  2. proposer une session SOLO : si je suis à l'appartement, que
 *     l'objectif de solitude du jour n'est pas atteint et qu'il est entre
 *     10 h 30 et 22 h 30, une notification locale suggère de laisser
 *     Boubou seul (une seule par jour).
 *
 * La règle « Fiona est là et pas Greg → Fiona est notifiée ; les deux là →
 * les deux notifiés » se ramène à « celui qui est à l'appartement reçoit la
 * notification » : tout se décide donc sur l'appareil, sans serveur.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { parisDayKey } from '@/lib/format';
import { DEFAULT_GOALS, fetchGoals } from '@/lib/goals';
import { supabase } from '@/lib/supabase';
import type { Participant } from '@/lib/types';

/** Adresse de l'appartement (géocodée au premier réglage). */
export const HOME_ADDRESS = '4T passage de Melun, 75019 Paris';

/** Repli si le géocodage échoue (centre du passage de Melun). */
const HOME_FALLBACK = { latitude: 48.8838936, longitude: 2.3764163 };

/** Rayon de la zone « à la maison ». Assez large pour couvrir l'immeuble
 *  et la précision GPS en ville, assez serré pour ne pas déborder. */
const HOME_RADIUS_METERS = 140;

const GEOFENCE_TASK = 'ubuntu-home-geofence';
const STORAGE_KEY = 'ubuntu.location.v1';

/** Fenêtre pendant laquelle on ose proposer une session (heure de Paris). */
const NUDGE_START_MINUTES = 10 * 60 + 30;
const NUDGE_END_MINUTES = 22 * 60 + 30;

/** Ce que le suivi a besoin de savoir, y compris réveillé en tâche de fond
 *  (aucun contexte React n'est disponible là-bas). */
interface LocationState {
  enabled: boolean;
  dogId: string | null;
  person: Participant | null;
  home: { latitude: number; longitude: number } | null;
  /** Dernière position connue vis-à-vis de l'appartement. */
  atHome: boolean | null;
  /** Jour (AAAA-MM-JJ) de la dernière notification programmée. */
  lastNudgeDay: string | null;
  /** Identifiant de la notification en attente (pour l'annuler). */
  pendingNudgeId: string | null;
}

const EMPTY_STATE: LocationState = {
  enabled: false,
  dogId: null,
  person: null,
  home: null,
  atHome: null,
  lastNudgeDay: null,
  pendingNudgeId: null,
};

export async function readState(): Promise<LocationState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<LocationState>) };
  } catch {
    return EMPTY_STATE;
  }
}

async function writeState(patch: Partial<LocationState>): Promise<LocationState> {
  const next = { ...(await readState()), ...patch };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Minutes écoulées depuis minuit, heure de Paris. */
function parisMinutesOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** Minutes de solitude déjà cumulées aujourd'hui (sessions comprises). */
async function todaySoloMinutes(dogId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('sessions')
    .select('started_at, ended_at')
    .eq('dog_id', dogId)
    .gte('started_at', todayStart.toISOString());
  if (error) throw new Error(error.message);
  const now = Date.now();
  const seconds = ((data as { started_at: string; ended_at: string | null }[] | null) ?? []).reduce(
    (sum, s) => {
      const end = s.ended_at ? new Date(s.ended_at).getTime() : now;
      return sum + Math.max(0, end - new Date(s.started_at).getTime()) / 1000;
    },
    0
  );
  return Math.round(seconds / 60);
}

/** Annule la suggestion en attente (objectif atteint, ou on est parti). */
async function cancelNudge(state: LocationState) {
  if (!state.pendingNudgeId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(state.pendingNudgeId);
  } catch {
    // Déjà délivrée ou inconnue : rien à faire.
  }
  await writeState({ pendingNudgeId: null });
}

/**
 * (Re)décide s'il faut proposer une session SOLO aujourd'hui. Appelée à
 * chaque entrée/sortie de zone et à chaque rafraîchissement de l'accueil.
 */
export async function refreshSoloNudge(context?: {
  soloMinutes: number;
  goalMinutes: number;
}): Promise<void> {
  const state = await readState();
  if (!state.enabled || !state.dogId) return;

  // Pas à la maison : rien à proposer (et on annule ce qui traîne).
  if (state.atHome !== true) {
    await cancelNudge(state);
    return;
  }

  let soloMinutes = context?.soloMinutes;
  let goalMinutes = context?.goalMinutes;
  if (soloMinutes === undefined || goalMinutes === undefined) {
    try {
      const [minutes, goals] = await Promise.all([
        todaySoloMinutes(state.dogId),
        fetchGoals(state.dogId),
      ]);
      soloMinutes = minutes;
      goalMinutes = goals.soloMinutes;
    } catch {
      // Réseau indisponible (réveil en arrière-plan) : on retentera.
      return;
    }
  }
  goalMinutes = goalMinutes || DEFAULT_GOALS.soloMinutes;

  // Objectif atteint : on n'embête personne.
  if (soloMinutes >= goalMinutes) {
    await cancelNudge(state);
    return;
  }

  const today = parisDayKey(new Date().toISOString());
  if (state.lastNudgeDay === today) return;
  if (state.pendingNudgeId) return;

  const minutes = parisMinutesOfDay(new Date());
  if (minutes > NUDGE_END_MINUTES) return;

  // Avant l'ouverture de la fenêtre : on programme pour 10 h 30 ; dedans :
  // dans dix minutes (le temps de rentrer et de poser ses affaires — et
  // si une session démarre entre-temps, la suggestion s'annule).
  const date = new Date();
  if (minutes < NUDGE_START_MINUTES) date.setTime(date.getTime() + (NUDGE_START_MINUTES - minutes) * 60_000);
  else date.setTime(date.getTime() + 10 * 60_000);

  const remaining = Math.max(1, goalMinutes - soloMinutes);
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '🚪 Et si tu laissais Boubou seul ?',
      body: `Il reste ${remaining} min de solitude à faire aujourd'hui (objectif ${goalMinutes} min).`,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  await writeState({ pendingNudgeId: id, lastNudgeDay: today });
}

/** Déplace l'avatar de la personne : salon si elle est là, sentier sinon. */
async function syncAvatar(state: LocationState, atHome: boolean) {
  if (!state.dogId || !state.person) return;
  const { error } = await supabase.from('avatar_positions').upsert(
    {
      dog_id: state.dogId,
      person: state.person,
      space: atHome ? 'salon' : 'dehors',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'dog_id,person' }
  );
  if (error) console.warn('Position (localisation) non enregistrée :', error.message);
}

/** Entrée ou sortie de la zone : avatar + suggestion de session. */
async function handlePresence(atHome: boolean) {
  const state = await writeState({ atHome });
  if (!state.enabled) return;
  await syncAvatar(state, atHome);
  await refreshSoloNudge();
}

// La tâche doit être définie au chargement du module, hors de tout
// composant : le système relance l'app en arrière-plan pour la déclencher.
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType } = (data ?? {}) as { eventType?: Location.GeofencingEventType };
  if (eventType === undefined) return;
  await handlePresence(eventType === Location.GeofencingEventType.Enter);
});

/** Coordonnées de l'appartement (géocodage, avec repli codé en dur). */
async function resolveHome(): Promise<{ latitude: number; longitude: number }> {
  try {
    const results = await Location.geocodeAsync(HOME_ADDRESS);
    const first = results[0];
    if (first) return { latitude: first.latitude, longitude: first.longitude };
  } catch {
    // Géocodeur indisponible : le repli fait l'affaire.
  }
  return HOME_FALLBACK;
}

/**
 * Active le suivi : permissions, géocodage de l'appartement, démarrage de
 * la surveillance de zone et première mesure. Renvoie un message d'erreur
 * en français, ou null si tout s'est bien passé.
 */
export async function enableHomeTracking(
  dogId: string,
  person: Participant
): Promise<string | null> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return 'Permission de localisation refusée.';

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    return 'Il faut autoriser la localisation « Toujours » pour être prévenu même app fermée.';
  }

  const notifications = await Notifications.getPermissionsAsync();
  if (!notifications.granted) await Notifications.requestPermissionsAsync();

  const home = await resolveHome();
  await writeState({ enabled: true, dogId, person, home });

  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
    await Location.startGeofencingAsync(GEOFENCE_TASK, [
      {
        identifier: 'home',
        latitude: home.latitude,
        longitude: home.longitude,
        radius: HOME_RADIUS_METERS,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
  } catch (error) {
    await writeState({ enabled: false });
    return error instanceof Error ? error.message : 'Surveillance de zone impossible.';
  }

  await checkPositionNow();
  return null;
}

/** Coupe le suivi (et la suggestion en attente). */
export async function disableHomeTracking(): Promise<void> {
  const state = await readState();
  await cancelNudge(state);
  try {
    if (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch {
    // Déjà arrêtée.
  }
  await writeState({ enabled: false, atHome: null });
}

/** Distance approximative en mètres entre deux points (équirectangulaire). */
function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * toRad * Math.cos(((a.latitude + b.latitude) / 2) * toRad);
  const y = (b.latitude - a.latitude) * toRad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/**
 * Mesure immédiate : le geofencing ne prévient qu'aux FRANCHISSEMENTS, il
 * faut donc se resynchroniser au lancement de l'app (et au retour au
 * premier plan).
 */
export async function checkPositionNow(): Promise<boolean | null> {
  const state = await readState();
  if (!state.enabled || !state.home) return null;
  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const atHome =
      distanceMeters(state.home, {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }) <= HOME_RADIUS_METERS;
    if (atHome !== state.atHome) await handlePresence(atHome);
    return atHome;
  } catch {
    return state.atHome;
  }
}

/** Garde la configuration à jour quand le chien/la personne sont connus. */
export async function syncTrackingContext(dogId: string, person: Participant): Promise<void> {
  const state = await readState();
  if (!state.enabled) return;
  if (state.dogId === dogId && state.person === person) return;
  await writeState({ dogId, person });
}
