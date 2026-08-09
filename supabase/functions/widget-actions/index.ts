// Edge Function pour le widget iOS : trois actions protégées par un secret
// statique (WIDGET_SECRET) car le widget ne peut pas rafraîchir un JWT
// utilisateur (même modèle qu'AGENT_SECRET pour l'agent Python).
//   - walk   : enregistre une balade de 15 min (démarrée il y a 5 min)
//   - solo   : démarre une session de solitude (409 si déjà en cours)
//   - status : session en cours (durée + % calme) + dernière balade
// Déployée avec verify_jwt=false ; service role → RLS contournée, d'où le
// secret obligatoire.
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const epoch = (iso: string | null): number | null =>
  iso ? new Date(iso).getTime() / 1000 : null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  let body: { secret?: string; dog_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const expected = Deno.env.get('WIDGET_SECRET');
  if (!expected || body.secret !== expected) return json({ error: 'unauthorized' }, 401);
  const dogId = body.dog_id;
  if (!dogId) return json({ error: 'missing_dog_id' }, 400);

  if (body.action === 'walk') {
    const now = Date.now();
    const { data, error } = await supabase
      .from('activities')
      .insert({
        dog_id: dogId,
        kind: 'walk',
        at: new Date(now - 5 * 60 * 1000).toISOString(),
        ended_at: new Date(now + 10 * 60 * 1000).toISOString(),
        poop_small: false,
        poop_big: false,
        off_leash: false,
      })
      .select('at, ended_at')
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ walk: { at_epoch: epoch(data.at), ended_at_epoch: epoch(data.ended_at) } });
  }

  if (body.action === 'solo') {
    const { data: open, error: openError } = await supabase
      .from('sessions')
      .select('id')
      .eq('dog_id', dogId)
      .is('ended_at', null)
      .limit(1);
    if (openError) return json({ error: openError.message }, 500);
    if (open.length > 0) return json({ error: 'already_active' }, 409);
    // Départ « inconnu » depuis le widget : departure_state/type et
    // human_location restent null, éditables ensuite dans la fiche session.
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        dog_id: dogId,
        trigger: 'manual',
        started_at: new Date().toISOString(),
        solitude_type: 'away',
        is_exercise: true,
      })
      .select('id, started_at')
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({
      session: { id: data.id, started_at_epoch: epoch(data.started_at), calm_percent: 100 },
    });
  }

  if (body.action === 'status') {
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, started_at')
      .eq('dog_id', dogId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) return json({ error: error.message }, 500);

    let session = null;
    const openSession = sessions[0];
    if (openSession) {
      // La vue calcule le % calme des sessions en cours avec now().
      const { data: summary } = await supabase
        .from('session_summaries')
        .select('calm_percent')
        .eq('session_id', openSession.id)
        .maybeSingle();
      session = {
        id: openSession.id,
        started_at_epoch: epoch(openSession.started_at),
        calm_percent: summary?.calm_percent ?? null,
      };
    }

    const { data: walks } = await supabase
      .from('activities')
      .select('at, ended_at')
      .eq('dog_id', dogId)
      .eq('kind', 'walk')
      .order('at', { ascending: false })
      .limit(1);
    const walk = walks?.[0];
    return json({
      session,
      last_walk: walk
        ? { at_epoch: epoch(walk.at), ended_at_epoch: epoch(walk.ended_at) }
        : null,
    });
  }

  return json({ error: 'unknown_action' }, 400);
});
