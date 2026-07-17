-- Épisodes manuels (couinements ratés par l'agent, saisis par l'utilisateur)
-- + observations comportementales (soulagement, panique) pendant la session.

-- ------------------------------------------------- épisodes manuels

alter table public.vocal_episodes
  add column source text not null default 'agent'
  check (source in ('agent', 'manual'));

-- L'utilisateur peut créer/supprimer SES épisodes manuels uniquement
-- (ceux de l'agent restent en lecture seule côté app).
create policy vocal_episodes_owner_insert_manual on public.vocal_episodes
  for insert with check (
    source = 'manual'
    and exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

create policy vocal_episodes_owner_delete_manual on public.vocal_episodes
  for delete using (
    source = 'manual'
    and exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

-- ------------------------------------------------- observations

create table public.observed_events (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete cascade,
  kind text not null check (kind in ('relief', 'panic')),
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index observed_events_session_idx on public.observed_events (session_id);
create index observed_events_dog_at_idx on public.observed_events (dog_id, at desc);

alter table public.observed_events enable row level security;

create policy observed_events_owner_all on public.observed_events
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );
