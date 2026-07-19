-- Nouveau type d'activité 'mat' : Ubuntu est allé sur son tapis (salon).
-- On encourage ce comportement, chaque visite est comptée.

alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check
  check (kind in ('walk', 'meal', 'play', 'mat', 'other'));
