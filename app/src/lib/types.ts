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

export interface Session {
  id: string;
  dog_id: string;
  started_at: string;
  ended_at: string | null;
  trigger: SessionTrigger;
  notes: string | null;
}

export interface VocalEpisode {
  id: string;
  session_id: string | null;
  dog_id: string;
  started_at: string;
  ended_at: string;
  kind: EpisodeKind;
  avg_confidence: number;
  peak_confidence: number;
  clip_path: string | null;
}

export interface AgentHeartbeat {
  id: number;
  dog_id: string;
  at: string;
  status: AgentStatus;
  rms_level: number;
}

export type ActivityKind = 'walk' | 'meal' | 'play' | 'other';

export interface Activity {
  id: string;
  dog_id: string;
  kind: ActivityKind;
  at: string;
  notes: string | null;
  created_at: string;
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
