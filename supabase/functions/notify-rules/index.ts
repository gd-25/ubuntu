// notify-rules — déclenchée par un Database Webhook sur INSERT vocal_episodes.
//
// Setup (Dashboard → Database → Webhooks) :
//   - table : vocal_episodes, événement : INSERT
//   - URL : https://<project>.functions.supabase.co/notify-rules
//   - header : x-webhook-secret = <WEBHOOK_SECRET>
// Déployer avec :  supabase functions deploy notify-rules --no-verify-jwt
// Secrets :        supabase secrets set WEBHOOK_SECRET=... NOTIFY_MIN_EPISODE_MINUTES=3

import { createClient } from "npm:@supabase/supabase-js@2";
import { applyNotifyRules, type EpisodeRecord } from "../_shared/notify.ts";

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await req.json();
  if (payload.type !== "INSERT" || payload.table !== "vocal_episodes") {
    return Response.json({ skipped: true });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const applied = await applyNotifyRules(
    supabase,
    payload.record as EpisodeRecord,
  );
  return Response.json({ applied });
});
