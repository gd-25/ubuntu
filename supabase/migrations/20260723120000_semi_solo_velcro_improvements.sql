-- Semi solo (Ubuntu seul dans une pièce, l'humain dans une autre),
-- activité velcro (pot de colle) et notes d'amélioration de l'app.

-- ----------------------------------------------------------- activities

-- Velcro : Ubuntu pot de colle (heure de début/fin + notes).
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check
  check (kind in ('walk', 'meal', 'play', 'mat', 'fake_cue', 'care', 'velcro', 'other'));

-- ---------------------------------------------------- semi_solo_sessions

-- Session semi solo saisie a posteriori : Ubuntu seul dans une pièce
-- pendant qu'un humain est dans une autre. Juste début, fin et notes.
-- Objectif : 1 h par jour.
create table public.semi_solo_sessions (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.semi_solo_sessions enable row level security;

create policy semi_solo_sessions_member_all on public.semi_solo_sessions
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

-- ------------------------------------------------------ app_improvements

-- Idées d'amélioration de l'app, saisies dans Réglages (simple stockage).
create table public.app_improvements (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.app_improvements enable row level security;

create policy app_improvements_member_all on public.app_improvements
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));
