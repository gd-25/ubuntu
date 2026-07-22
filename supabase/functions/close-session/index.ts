// close-session — appelée par l'app à la fin d'une session.
// Clôt la session, calcule le résumé et envoie la notif récap, ex. :
// "Milo est resté seul 2 h 10, il a vocalisé 14 min sur 8 épisodes."
//
// Appel côté app : supabase.functions.invoke('close-session', { body: { session_id } })
// (JWT utilisateur vérifié : déployer SANS --no-verify-jwt.)

import { createClient } from "npm:@supabase/supabase-js@2";
import { formatDuration, sendExpoPush } from "../_shared/push.ts";

/** Écart fin de session ↔ dernier épisode sous lequel on considère être
 * rentré pendant/juste après une vocalise. */
const RETURN_SILENCE_THRESHOLD_MS = 30_000;

Deno.serve(async (req) => {
  const { session_id } = await req.json();
  if (!session_id) {
    return Response.json({ error: "session_id requis" }, { status: 400 });
  }

  // Client "utilisateur" : les policies RLS garantissent qu'on ne peut clore
  // que ses propres sessions.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );

  const { data: session, error: updateError } = await userClient
    .from("sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", session_id)
    .is("ended_at", null)
    .select("id, dog_id, started_at, ended_at")
    .single();
  if (updateError || !session) {
    return Response.json(
      { error: "session introuvable ou déjà close" },
      { status: 404 },
    );
  }

  // « Rentré sur silence » calculé, pas saisi : la session se termine à
  // l'ouverture de la porte. Si le dernier épisode vocal s'est terminé
  // moins de 30 s avant la fin (ou déborde dessus), on est rentré
  // pendant/juste après une vocalise.
  const { data: lastEpisode } = await userClient
    .from("vocal_episodes")
    .select("ended_at")
    .eq("session_id", session_id)
    .eq("dismissed", false)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const returnedDuringVocalization = lastEpisode
    ? Date.parse(session.ended_at) - Date.parse(lastEpisode.ended_at) <
      RETURN_SILENCE_THRESHOLD_MS
    : false;
  await userClient
    .from("sessions")
    .update({ returned_during_vocalization: returnedDuringVocalization })
    .eq("id", session_id);

  const { data: summary } = await userClient
    .from("session_summaries")
    .select("*")
    .eq("session_id", session_id)
    .single();
  const { data: dog } = await userClient
    .from("dogs")
    .select("name, owner_id")
    .eq("id", session.dog_id)
    .single();

  // Récap push.
  const name = dog?.name ?? "Le chien";
  const aloneSeconds =
    (Date.parse(session.ended_at) - Date.parse(session.started_at)) / 1000;
  const vocalSeconds = summary?.total_vocal_seconds ?? 0;
  const episodes = summary?.episode_count ?? 0;

  let body: string;
  if (episodes === 0) {
    body = `${name} est resté seul ${formatDuration(aloneSeconds)} et est resté calme tout du long 🎉`;
  } else {
    body = `${name} est resté seul ${formatDuration(aloneSeconds)}, il a vocalisé ${formatDuration(vocalSeconds)} sur ${episodes} épisode(s)`;
    const longest = summary?.longest_episode_seconds ?? 0;
    if (longest >= 60) {
      body += `, dont ${formatDuration(longest)} d'affilée`;
    }
    body += ".";
  }

  const { data: tokens } = await userClient
    .from("push_tokens")
    .select("expo_token");
  await sendExpoPush((tokens ?? []).map((t) => t.expo_token), {
    title: "🐾 Récap de la session",
    body,
    data: { session_id },
  });

  return Response.json({ summary, recap: body });
});
