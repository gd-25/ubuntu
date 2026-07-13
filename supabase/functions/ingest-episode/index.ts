// ingest-episode — ingestion d'un épisode par l'agent (alternative recommandée
// à l'écriture REST directe) : validation + rattachement session (via trigger
// Postgres) + application des règles de notification, en un seul appel.
//
// L'agent l'appelle avec le header x-agent-secret (secret partagé, distinct de
// la service key). Déployer avec :
//   supabase functions deploy ingest-episode --no-verify-jwt
//   supabase secrets set AGENT_SECRET=...

import { createClient } from "npm:@supabase/supabase-js@2";
import { applyNotifyRules, type EpisodeRecord } from "../_shared/notify.ts";

const KINDS = new Set(["bark", "howl", "whine"]);

function validate(body: Record<string, unknown>): string | null {
  if (typeof body.dog_id !== "string" || !body.dog_id) return "dog_id requis";
  if (typeof body.started_at !== "string" || isNaN(Date.parse(body.started_at))) {
    return "started_at invalide (ISO 8601 attendu)";
  }
  if (typeof body.ended_at !== "string" || isNaN(Date.parse(body.ended_at))) {
    return "ended_at invalide (ISO 8601 attendu)";
  }
  if (Date.parse(body.ended_at as string) < Date.parse(body.started_at as string)) {
    return "ended_at < started_at";
  }
  if (!KINDS.has(body.kind as string)) return "kind doit être bark|howl|whine";
  return null;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("AGENT_SECRET");
  if (!secret || req.headers.get("x-agent-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();
  const error = validate(body);
  if (error) return Response.json({ error }, { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: episode, error: insertError } = await supabase
    .from("vocal_episodes")
    .insert({
      dog_id: body.dog_id,
      started_at: body.started_at,
      ended_at: body.ended_at,
      kind: body.kind,
      avg_confidence: body.avg_confidence ?? null,
      peak_confidence: body.peak_confidence ?? null,
    })
    .select()
    .single();
  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  const applied = await applyNotifyRules(supabase, episode as EpisodeRecord);
  return Response.json({ episode_id: episode.id, notifications: applied });
});
