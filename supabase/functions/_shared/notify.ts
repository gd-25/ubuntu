// Règles de notification déclenchées à chaque épisode inséré.
// Partagé entre notify-rules (webhook DB) et ingest-episode (ingestion directe).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { formatDuration, sendExpoPush } from "./push.ts";

export interface EpisodeRecord {
  id: string;
  session_id: string | null;
  dog_id: string;
  started_at: string;
  ended_at: string;
  kind: "bark" | "howl" | "whine";
}

const ANTI_SPAM_MINUTES = 10;

const KIND_VERB: Record<string, string> = {
  bark: "aboie",
  howl: "hurle",
  whine: "gémit",
};

async function ownerTokens(
  supabase: SupabaseClient,
  dogId: string,
): Promise<string[]> {
  const { data: dog } = await supabase
    .from("dogs")
    .select("owner_id")
    .eq("id", dogId)
    .single();
  if (!dog) return [];
  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("expo_token")
    .eq("user_id", dog.owner_id);
  return (tokens ?? []).map((t) => t.expo_token);
}

/** Anti-spam : true si une notif de cette règle est partie il y a moins de 10 min. */
async function recentlyNotified(
  supabase: SupabaseClient,
  rule: string,
  dogId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - ANTI_SPAM_MINUTES * 60_000).toISOString();
  const { count } = await supabase
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("rule", rule)
    .eq("dog_id", dogId)
    .gte("sent_at", since);
  return (count ?? 0) > 0;
}

async function logNotification(
  supabase: SupabaseClient,
  rule: string,
  episode: EpisodeRecord,
): Promise<void> {
  await supabase.from("notification_log").insert({
    rule,
    dog_id: episode.dog_id,
    session_id: episode.session_id,
  });
}

/** Applique les règles de notif à un épisode inséré ou étendu (live). */
export async function applyNotifyRules(
  supabase: SupabaseClient,
  episode: EpisodeRecord,
  opts: { firstEpisode?: boolean } = {},
): Promise<string[]> {
  const applied: string[] = [];
  const allowFirstEpisode = opts.firstEpisode ?? true;
  const durationSeconds =
    (Date.parse(episode.ended_at) - Date.parse(episode.started_at)) / 1000;
  const minMinutes = Number(
    Deno.env.get("NOTIFY_MIN_EPISODE_MINUTES") ?? "3",
  );
  const notifyFirst =
    (Deno.env.get("NOTIFY_FIRST_EPISODE") ?? "true").toLowerCase() !== "false";
  const verb = KIND_VERB[episode.kind] ?? "vocalise";

  // Règle 1 : épisode long (> N minutes).
  if (durationSeconds >= minMinutes * 60) {
    if (!(await recentlyNotified(supabase, "long_episode", episode.dog_id))) {
      const tokens = await ownerTokens(supabase, episode.dog_id);
      await sendExpoPush(tokens, {
        title: "🔊 Épisode prolongé",
        body: `Ça fait ${formatDuration(durationSeconds)} qu'il ${verb}.`,
        data: { episode_id: episode.id, session_id: episode.session_id },
      });
      await logNotification(supabase, "long_episode", episode);
      applied.push("long_episode");
    }
  }

  // Règle 2 : premier épisode d'une session (optionnelle, INSERT seulement).
  if (notifyFirst && allowFirstEpisode && episode.session_id) {
    const { count } = await supabase
      .from("vocal_episodes")
      .select("id", { count: "exact", head: true })
      .eq("session_id", episode.session_id)
      .neq("id", episode.id);
    const isFirst = (count ?? 0) === 0;
    if (
      isFirst &&
      !(await recentlyNotified(supabase, "first_episode", episode.dog_id))
    ) {
      const tokens = await ownerTokens(supabase, episode.dog_id);
      await sendExpoPush(tokens, {
        title: "🐾 Première vocalise",
        body: `Il ${verb} pour la première fois depuis ton départ (${formatDuration(durationSeconds)}).`,
        data: { episode_id: episode.id, session_id: episode.session_id },
      });
      await logNotification(supabase, "first_episode", episode);
      applied.push("first_episode");
    }
  }

  return applied;
}
