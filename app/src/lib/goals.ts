import { supabase } from '@/lib/supabase';

/** Objectifs quotidiens, paramétrables dans Réglages (table dog_goals). */
export interface Goals {
  /** Faux signaux par jour. */
  cues: number;
  /** Sessions Overall par jour. */
  overalls: number;
  /** Minutes de solitude (sessions SOLO) par jour. */
  soloMinutes: number;
}

/** Valeurs par défaut tant qu'aucune ligne dog_goals n'existe. */
export const DEFAULT_GOALS: Goals = {
  cues: 10,
  overalls: 1,
  soloMinutes: 15,
};

interface DogGoalsRow {
  cues_per_day: number;
  overalls_per_day: number;
  solo_minutes_per_day: number;
}

/** Objectifs du chien (valeurs par défaut si pas de ligne ou erreur réseau). */
export async function fetchGoals(dogId: string): Promise<Goals> {
  const { data, error } = await supabase
    .from('dog_goals')
    .select('*')
    .eq('dog_id', dogId)
    .maybeSingle();
  if (error || !data) return DEFAULT_GOALS;
  const row = data as DogGoalsRow;
  return {
    cues: row.cues_per_day,
    overalls: row.overalls_per_day,
    soloMinutes: row.solo_minutes_per_day,
  };
}

/**
 * Palier suggéré pour la PROCHAINE session (minutes), à partir des
 * dernières sessions d'exercice terminées :
 * - la dernière était agitée (< 80 % calme) → on redescend de moitié ;
 * - 3 sessions calmes de suite (≥ 95 %) → +25 % ;
 * - sinon on répète la durée de la dernière.
 * La durée monte derrière le calme, jamais devant.
 */
export async function suggestTargetMinutes(dogId: string): Promise<number> {
  const { data, error } = await supabase
    .from('session_summaries')
    .select('started_at, ended_at, calm_percent')
    .eq('dog_id', dogId)
    .eq('is_exercise', true)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(3);
  const rows = (data as { started_at: string; ended_at: string; calm_percent: number }[] | null) ?? [];
  if (error || rows.length === 0) return DEFAULT_GOALS.soloMinutes;
  const minutesOf = (r: { started_at: string; ended_at: string }) =>
    Math.max(1, Math.round((Date.parse(r.ended_at) - Date.parse(r.started_at)) / 60_000));
  const base = Math.max(5, minutesOf(rows[0]));
  if (rows[0].calm_percent < 80) return Math.max(5, Math.round(base / 2));
  if (rows.length === 3 && rows.every((r) => r.calm_percent >= 95)) {
    return Math.round(base * 1.25);
  }
  return base;
}

/** Enregistre les objectifs (upsert de la ligne du chien). */
export async function saveGoals(dogId: string, goals: Goals): Promise<string | null> {
  const { error } = await supabase.from('dog_goals').upsert(
    {
      dog_id: dogId,
      cues_per_day: goals.cues,
      overalls_per_day: goals.overalls,
      solo_minutes_per_day: goals.soloMinutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'dog_id' }
  );
  return error ? error.message : null;
}
