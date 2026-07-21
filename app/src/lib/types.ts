/** Row types matching the Supabase schema exactly. All timestamps are UTC ISO strings. */

export type SessionTrigger = 'manual' | 'geofence';
export type EpisodeKind = 'bark' | 'howl' | 'whine';
export type AgentStatus = 'listening' | 'camera_unreachable' | 'offline';

export interface Dog {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

/** 'away' = humains partis de la maison ; 'in_home' = isolé dans une pièce. */
export type SolitudeType = 'away' | 'in_home';

/** État d'Ubuntu au moment du départ (capturé juste après le tap SOLO). */
export type DepartureState = 'asleep' | 'settled' | 'active' | 'following';

/** Qui est parti, déduit de la position des avatars au moment du tap. */
export type DepartureType = 'solo_greg' | 'solo_fiona' | 'duo';

export interface Session {
  id: string;
  dog_id: string;
  started_at: string;
  ended_at: string | null;
  trigger: SessionTrigger;
  notes: string | null;
  solitude_type: SolitudeType | null;
  departure_state: DepartureState | null;
  departure_type: DepartureType | null;
  /** false = absence subie (courses…), exclue des stats d'entraînement. */
  is_exercise: boolean;
  /** Calculé à la clôture : dernier épisode < 30 s avant la fin de session. */
  returned_during_vocalization: boolean | null;
}

export interface VocalEpisode {
  id: string;
  session_id: string | null;
  dog_id: string;
  started_at: string;
  ended_at: string;
  kind: EpisodeKind;
  avg_confidence: number | null;
  peak_confidence: number | null;
  clip_path: string | null;
  /** 'agent' = détecté par YAMNet ; 'manual' = saisi par l'utilisateur. */
  source: 'agent' | 'manual';
}

/** Observation comportementale pendant une session (pas une vocalise). */
export type ObservedKind = 'relief' | 'panic';

export interface ObservedEvent {
  id: string;
  dog_id: string;
  session_id: string | null;
  kind: ObservedKind;
  at: string;
  created_at: string;
}

export interface AgentHeartbeat {
  id: number;
  dog_id: string;
  at: string;
  status: AgentStatus;
  rms_level: number;
}

/** Particularité de session ("Tapis de léchage", …), liste éditable par chien. */
export interface Tag {
  id: string;
  dog_id: string;
  label: string;
  created_at: string;
}

export interface SessionTag {
  session_id: string;
  tag_id: string;
  created_at: string;
}

/**
 * 'mat' = Ubuntu est allé sur son tapis (comportement qu'on encourage).
 * 'fake_cue' = faux signaux de départ (objectif 15/jour). 'care' = garde.
 */
export type ActivityKind = 'walk' | 'meal' | 'play' | 'mat' | 'fake_cue' | 'care' | 'other';

/** Objets joués pendant un faux signal de départ. */
export type FakeCue = 'keys' | 'shoes' | 'socks' | 'elevator';

export interface Activity {
  id: string;
  dog_id: string;
  kind: ActivityKind;
  at: string;
  /** Fin de balade (null tant que la balade est en cours). */
  ended_at: string | null;
  /** Repas : fraction de la ration (0.25 / 0.5 / 0.75 / 1). */
  meal_fraction: number | null;
  notes: string | null;
  /** Sortie : cacas et lâché en liberté (grosse balade). */
  poop_small: boolean | null;
  poop_big: boolean | null;
  off_leash: boolean | null;
  /** Faux signaux : objets joués. */
  cues: FakeCue[] | null;
  /** Garde : nom de la personne + durée. */
  caregiver: string | null;
  duration_minutes: number | null;
  created_at: string;
}

/** Où Ubuntu a dormi cette nuit. */
export type NightLocation = 'outside_room' | 'in_room' | 'on_bed';

/**
 * Une nuit de dodo. Les vocalises de la nuit restent des épisodes orphelins
 * (session_id null, pas de vidéo) : on les lie par plage horaire.
 */
export interface Night {
  id: string;
  dog_id: string;
  started_at: string;
  ended_at: string;
  location: NightLocation;
  notes: string | null;
  created_at: string;
}

/**
 * Session du protocole Overall : la position finale du tapis est la
 * variable de généralisation (réussit-il partout ou juste à côté du canapé).
 */
export interface OverallSession {
  id: string;
  dog_id: string;
  at: string;
  duration_minutes: number;
  treats_count: number;
  notes: string | null;
  mat_x: number;
  mat_y: number;
  mat_space: Space;
  created_at: string;
}

/** Membres de la famille sur le plan de la maison. */
export type Person = 'greg' | 'fiona' | 'ubuntu';

/** Espaces du plan : pièces, balcon, palier et dehors (forêt). */
export type Space =
  | 'bureau'
  | 'chambre'
  | 'salon'
  | 'balcon'
  | 'dehors'
  | 'sdb'
  | 'couloir_int'
  | 'couloir_ext'
  | 'wc';

export interface AvatarPosition {
  dog_id: string;
  person: Person;
  space: Space;
  updated_at: string;
}

export interface PushToken {
  id: string;
  user_id: string;
  expo_token: string;
  platform: string;
  created_at: string;
}

/** Row shape of the `session_summaries` view. */
export interface SessionSummary {
  session_id: string;
  dog_id: string;
  started_at: string;
  ended_at: string | null;
  solitude_type: SolitudeType | null;
  is_exercise: boolean;
  departure_state: DepartureState | null;
  departure_type: DepartureType | null;
  returned_during_vocalization: boolean | null;
  episode_count: number;
  total_vocal_seconds: number;
  bark_seconds: number;
  howl_seconds: number;
  whine_seconds: number;
  longest_episode_seconds: number;
  time_to_first_vocalization_seconds: number | null;
  calm_percent: number;
}
