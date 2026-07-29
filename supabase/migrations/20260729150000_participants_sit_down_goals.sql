-- Participants d'une session SOLO (qui est de l'exercice — un absent
-- n'était pas dans l'appartement du tout), marqueurs assis/couché en plus
-- du soulagement historique, et objectifs quotidiens paramétrables.

-- ------------------------------------------------------------- sessions

alter table public.sessions
  add column participants text[] not null default '{greg,fiona}';

-- ------------------------------------------------------ observed_events

-- 'sit' (assis) et 'down' (couché) : les deux marques de soulagement
-- possibles ; 'relief' est conservé pour les anciennes lignes.
alter table public.observed_events drop constraint observed_events_kind_check;
alter table public.observed_events add constraint observed_events_kind_check
  check (kind in ('relief', 'panic', 'sit', 'down'));

-- ------------------------------------------------------------ dog_goals

-- Objectifs quotidiens, éditables dans Réglages (une ligne par chien ;
-- pas de ligne = valeurs par défaut de l'app).
create table public.dog_goals (
  dog_id uuid primary key references public.dogs (id) on delete cascade,
  cues_per_day int not null default 10,
  overalls_per_day int not null default 1,
  semi_solo_minutes_per_day int not null default 60,
  solo_minutes_per_day int not null default 15,
  updated_at timestamptz not null default now()
);

alter table public.dog_goals enable row level security;

create policy dog_goals_member_all on public.dog_goals
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));
