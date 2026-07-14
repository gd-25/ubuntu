-- UBUNTU — Dog Alone Monitor : schéma initial.
-- Un seul utilisateur au départ, mais schéma multi-user propre (auth.users).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  trigger text not null default 'manual' check (trigger in ('manual', 'geofence')),
  notes text
);

create table public.vocal_episodes (
  id uuid primary key default gen_random_uuid(),
  -- Rattaché automatiquement à la session ouverte par trigger (voir plus bas) ;
  -- reste null si le chien vocalise hors session (donnée conservée volontairement).
  session_id uuid references public.sessions (id) on delete set null,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  kind text not null check (kind in ('bark', 'howl', 'whine')),
  avg_confidence real,
  peak_confidence real,
  clip_path text,
  check (ended_at >= started_at)
);

create table public.agent_heartbeats (
  id bigint generated always as identity primary key,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  at timestamptz not null default now(),
  status text not null check (status in ('listening', 'camera_unreachable', 'offline')),
  rms_level real
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_token text not null unique,
  platform text,
  created_at timestamptz not null default now()
);

-- Journal des notifications envoyées (anti-spam : max 1 notif / 10 min / règle).
create table public.notification_log (
  id bigint generated always as identity primary key,
  rule text not null,
  dog_id uuid references public.dogs (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  sent_at timestamptz not null default now()
);

create index sessions_dog_started_idx on public.sessions (dog_id, started_at desc);
create index vocal_episodes_dog_started_idx on public.vocal_episodes (dog_id, started_at desc);
create index vocal_episodes_session_idx on public.vocal_episodes (session_id);
create index agent_heartbeats_dog_at_idx on public.agent_heartbeats (dog_id, at desc);
create index notification_log_rule_idx on public.notification_log (rule, dog_id, sent_at desc);

-- ------------------------------------------------- rattachement à la session

-- L'agent envoie les épisodes sans session_id (il ne sait pas si une session
-- est ouverte). On rattache l'épisode à la session couvrant son début —
-- par PLAGE TEMPORELLE, pas seulement les sessions ouvertes : un épisode
-- arrive souvent après la clôture (délai de fusion ~5 s, file offline).
create function public.attach_episode_to_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_id is null then
    select s.id into new.session_id
    from public.sessions s
    where s.dog_id = new.dog_id
      and s.started_at <= new.started_at
      and (s.ended_at is null or new.started_at <= s.ended_at)
    order by s.started_at desc
    limit 1;
  end if;
  return new;
end;
$$;

create trigger vocal_episodes_attach_session
before insert on public.vocal_episodes
for each row execute function public.attach_episode_to_session();

-- ---------------------------------------------------------------- vue résumé

create view public.session_summaries
with (security_invoker = true) as
select
  s.id as session_id,
  s.dog_id,
  s.started_at,
  s.ended_at,
  s.trigger,
  s.notes,
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

-- ---------------------------------------------------------------- RLS

-- Owner-only partout. L'agent écrit avec la service_role key et bypasse RLS.

alter table public.dogs enable row level security;
alter table public.sessions enable row level security;
alter table public.vocal_episodes enable row level security;
alter table public.agent_heartbeats enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_log enable row level security;

create policy dogs_owner_all on public.dogs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy sessions_owner_all on public.sessions
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

-- Épisodes et heartbeats : lecture seule côté app (seul l'agent écrit).
create policy vocal_episodes_owner_read on public.vocal_episodes
  for select using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

create policy agent_heartbeats_owner_read on public.agent_heartbeats
  for select using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

create policy push_tokens_owner_all on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_log : réservé aux Edge Functions (service role) — aucune policy user.

-- ---------------------------------------------------------------- realtime

-- L'app s'abonne aux inserts épisodes + heartbeats pour l'écran live.
alter publication supabase_realtime add table public.vocal_episodes;
alter publication supabase_realtime add table public.agent_heartbeats;
