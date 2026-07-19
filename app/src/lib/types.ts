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

export interface Session {
  id: string;
  dog_id: string;
  started_at: string;
  ended_at: string | null;
  trigger: SessionTrigger;
  notes: string | null;
  solitude_type: SolitudeType | null;
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

/** 'mat' = Ubuntu est allé sur son tapis (comportement qu'on encourage). */
export type ActivityKind = 'walk' | 'meal' | 'play' | 'mat' | 'other';

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
  episode_count: number;
  total_vocal_seconds: number;
  bark_seconds: number;
  howl_seconds: number;
  whine_seconds: number;
  longest_episode_seconds: number;
  time_to_first_vocalization_seconds: number | null;
  calm_percent: number;
}
