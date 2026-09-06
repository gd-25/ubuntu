-- Le semi-solo a été retiré de l'app (supprimé volontairement du flux
-- d'entraînement) : on enlève la table et l'objectif quotidien associé.
drop table if exists public.semi_solo_sessions;
alter table public.dog_goals drop column if exists semi_solo_minutes_per_day;
