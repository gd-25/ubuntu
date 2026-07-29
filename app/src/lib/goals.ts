import { supabase } from '@/lib/supabase';

/** Objectifs quotidiens, paramétrables dans Réglages (table dog_goals). */
export interface Goals {
  /** Faux signaux par jour. */
  cues: number;
  /** Sessions Overall par jour. */
  overalls: number;
  /** Minutes de semi solo par jour. */
  semiSoloMinutes: number;
  /** Minutes de solitude (sessions SOLO) par jour. */
  soloMinutes: number;
}

/** Valeurs par défaut tant qu'aucune ligne dog_goals n'existe. */
export const DEFAULT_GOALS: Goals = {
  cues: 10,
  overalls: 1,
  semiSoloMinutes: 60,
  soloMinutes: 15,
};

interface DogGoalsRow {
  cues_per_day: number;
  overalls_per_day: number;
  semi_solo_minutes_per_day: number;
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
    semiSoloMinutes: row.semi_solo_minutes_per_day,
    soloMinutes: row.solo_minutes_per_day,
  };
}

/** Enregistre les objectifs (upsert de la ligne du chien). */
export async function saveGoals(dogId: string, goals: Goals): Promise<string | null> {
  const { error } = await supabase.from('dog_goals').upsert(
    {
      dog_id: dogId,
      cues_per_day: goals.cues,
      overalls_per_day: goals.overalls,
      semi_solo_minutes_per_day: goals.semiSoloMinutes,
      solo_minutes_per_day: goals.soloMinutes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'dog_id' }
  );
  return error ? error.message : null;
}
