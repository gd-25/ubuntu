// notify-rules — déclenchée par un Database Webhook sur vocal_episodes :
//   - INSERT : premier épisode d'une session (l'agent insère désormais
//     l'épisode dès son DÉBUT → la notif « première vocalise » est immédiate)
//   - UPDATE : quand l'extension live fait franchir à l'épisode le seuil
//     « épisode prolongé » (le trigger ne tire qu'au franchissement)
//
// Setup (trigger SQL notify_rules_webhook sur le projet hébergé) :
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
  const isInsert = payload.type === "INSERT";
  const isUpdate = payload.type === "UPDATE";
  if ((!isInsert && !isUpdate) || payload.table !== "vocal_episodes") {
    return Response.json({ skipped: true });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const applied = await applyNotifyRules(supabase, payload.record as EpisodeRecord, {
    // La règle « première vocalise » ne s'applique qu'à l'INSERT — un UPDATE
    // d'extension live ne doit pas la re-déclencher.
    firstEpisode: isInsert,
  });
  return Response.json({ applied });
});
