-- Carte maison (design rétro) : positions des avatars sur le plan,
-- sessions de solitude typées, balades avec durée, repas en fraction de ration.

-- ------------------------------------------------------------- sessions

-- Type de solitude : 'away' = les humains sont partis de la maison,
-- 'in_home' = Ubuntu est isolé dans une pièce, humains dans une autre pièce.
-- Null pour les sessions historiques / créées hors carte.
alter table public.sessions
  add column solitude_type text check (solitude_type in ('away', 'in_home'));

-- ----------------------------------------------------------- activities

-- Balade : at = début, ended_at = retour à la maison (null tant qu'en cours).
alter table public.activities add column ended_at timestamptz;
alter table public.activities
  add constraint activities_ended_after check (ended_at is null or ended_at >= at);

-- Repas : fraction de la ration (0.25 / 0.5 / 0.75 / 1).
alter table public.activities
  add column meal_fraction numeric check (meal_fraction > 0 and meal_fraction <= 1);

-- ------------------------------------------------------ avatar_positions

-- Position de chaque membre de la famille sur le plan de la maison.
-- Synchronisée en temps réel entre les téléphones.
create table public.avatar_positions (
  dog_id uuid not null references public.dogs (id) on delete cascade,
  person text not null check (person in ('greg', 'fiona', 'ubuntu')),
  space text not null check (space in ('bureau', 'chambre', 'salon', 'balcon', 'dehors')),
  updated_at timestamptz not null default now(),
  primary key (dog_id, person)
);

alter table public.avatar_positions enable row level security;

create policy avatar_positions_owner_all on public.avatar_positions
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

alter publication supabase_realtime add table public.avatar_positions;

-- Realtime : payload complet sur UPDATE (sinon seule la PK est envoyée).
alter table public.avatar_positions replica identity full;

-- Sessions en realtime aussi : l'autre téléphone voit la session
-- démarrer/se terminer sans recharger.
alter publication supabase_realtime add table public.sessions;
alter table public.sessions replica identity full;
