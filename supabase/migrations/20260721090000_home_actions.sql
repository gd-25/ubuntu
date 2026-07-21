-- Écran d'accueil outil de travail : sessions enrichies (état au départ, type
-- de départ, exercice vs absence subie, retour pendant vocalise), sorties
-- détaillées, faux signaux, garde, nuits (dodo) et sessions protocole Overall.

-- ------------------------------------------------------------- sessions

-- État d'Ubuntu au moment du départ (capturé juste après le tap SOLO) :
-- la variable la plus prédictive, un seul tap.
alter table public.sessions
  add column departure_state text
    check (departure_state in ('asleep', 'settled', 'active', 'following'));

-- Qui est parti, déduit de la position des avatars au moment du tap.
alter table public.sessions
  add column departure_type text
    check (departure_type in ('solo_greg', 'solo_fiona', 'duo'));

-- false = absence subie (courses…) : exclue des stats d'entraînement.
alter table public.sessions
  add column is_exercise boolean not null default true;

-- Calculé à la clôture : dernier épisode vocal terminé moins de 30 s avant
-- la fin de session → on est rentré pendant/juste après une vocalise.
alter table public.sessions
  add column returned_during_vocalization boolean;

-- ----------------------------------------------------------- activities

-- 'fake_cue' = faux signaux de départ (clés, chaussures…), objectif 15/jour.
-- 'care' = garde par un tiers.
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check
  check (kind in ('walk', 'meal', 'play', 'mat', 'fake_cue', 'care', 'other'));

-- Sortie : cacas et lâché en liberté (grosse balade).
alter table public.activities add column poop_small boolean;
alter table public.activities add column poop_big boolean;
alter table public.activities add column off_leash boolean;

-- Faux signaux : objets joués ('keys', 'shoes', 'socks', 'elevator').
alter table public.activities add column cues text[];

-- Garde : nom de la personne + durée.
alter table public.activities add column caregiver text;
alter table public.activities
  add column duration_minutes integer check (duration_minutes > 0);

-- ---------------------------------------------------------------- nights

-- Une nuit de dodo : lieu + plage horaire. Les vocalises de la nuit restent
-- des épisodes orphelins (session_id null, pas de vidéo) : on les lie par
-- plage horaire à l'affichage.
create table public.nights (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- 'outside_room' = hors chambre fermée, 'in_room' = dans la chambre mais
  -- pas sur le lit, 'on_bed' = sur le lit.
  location text not null check (location in ('outside_room', 'in_room', 'on_bed')),
  notes text,
  created_at timestamptz not null default now(),
  constraint nights_range check (ended_at > started_at)
);

create index nights_dog_started_idx on public.nights (dog_id, started_at desc);

alter table public.nights enable row level security;

create policy nights_owner_all on public.nights
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

-- ------------------------------------------------------ overall_sessions

-- Session du protocole Overall : le tapis est déplacé sur le plan, la
-- position finale est la variable de généralisation (réussit-il partout ou
-- juste à côté du canapé ?). Objectif 2/jour.
create table public.overall_sessions (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  at timestamptz not null default now(),
  duration_minutes integer not null check (duration_minutes > 0),
  treats_count integer not null default 0 check (treats_count >= 0),
  notes text,
  -- Position du tapis en unités carte + zone lisible.
  mat_x numeric not null,
  mat_y numeric not null,
  mat_space text not null,
  created_at timestamptz not null default now()
);

create index overall_sessions_dog_at_idx on public.overall_sessions (dog_id, at desc);

alter table public.overall_sessions enable row level security;

create policy overall_sessions_owner_all on public.overall_sessions
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

-- ------------------------------------------------------------- vue résumé

-- La vue expose les nouveaux champs de session (filtres d'entraînement).
-- Drop + create : `create or replace` ne peut pas insérer de colonnes au
-- milieu de la liste existante.
drop view public.session_summaries;
create view public.session_summaries
with (security_invoker = true) as
select
  s.id as session_id,
  s.dog_id,
  s.started_at,
  s.ended_at,
  s.trigger,
  s.notes,
  s.solitude_type,
  s.is_exercise,
  s.departure_state,
  s.departure_type,
  s.returned_during_vocalization,
  count(e.id)::int as episode_count,
  coalesce(sum(extract(epoch from e.ended_at - e.started_at)), 0)::real as total_vocal_seconds,
  coalesce(sum(extract(epoch from e.ended_at - e.started_at)) filter (where e.kind = 'bark'), 0)::real as bark_seconds,
  coalesce(sum(extract(epoch from e.ended_at - e.started_at)) filter (where e.kind = 'howl'), 0)::real as howl_seconds,
  coalesce(sum(extract(epoch from e.ended_at - e.started_at)) filter (where e.kind = 'whine'), 0)::real as whine_seconds,
  coalesce(max(extract(epoch from e.ended_at - e.started_at)), 0)::real as longest_episode_seconds,
  -- Métrique clé anxiété de séparation : délai avant la première vocalise.
  extract(epoch from min(e.started_at) - s.started_at)::real as time_to_first_vocalization_seconds,
  case
    when extract(epoch from coalesce(s.ended_at, now()) - s.started_at) > 0 then
      greatest(0, 100 * (1 - coalesce(sum(extract(epoch from e.ended_at - e.started_at)), 0)
        / extract(epoch from coalesce(s.ended_at, now()) - s.started_at)))::real
  end as calm_percent
from public.sessions s
left join public.vocal_episodes e on e.session_id = s.id
group by s.id;
