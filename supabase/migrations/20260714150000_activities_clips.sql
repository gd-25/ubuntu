-- Activités (sorties, repas…) + clips vidéo des épisodes.

-- ---------------------------------------------------------------- activités

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  kind text not null check (kind in ('walk', 'meal', 'play', 'other')),
  at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index activities_dog_at_idx on public.activities (dog_id, at desc);

alter table public.activities enable row level security;

create policy activities_owner_all on public.activities
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

-- ------------------------------------------------- sessions a posteriori

-- Le trigger d'épisodes ne rattache qu'à l'INSERT de l'épisode ; quand une
-- session est saisie après coup, on rattache les épisodes orphelins qui
-- tombent dans sa plage.
create function public.attach_episodes_to_new_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.vocal_episodes e
  set session_id = new.id
  where e.session_id is null
    and e.dog_id = new.dog_id
    and e.started_at >= new.started_at
    and (new.ended_at is null or e.started_at <= new.ended_at);
  return new;
end;
$$;

create trigger sessions_attach_existing_episodes
after insert on public.sessions
for each row execute function public.attach_episodes_to_new_session();

-- ---------------------------------------------------------------- clips

-- Bucket privé ; l'agent écrit avec la service key, l'app lit via URL signée.
insert into storage.buckets (id, name, public)
values ('clips', 'clips', false)
on conflict (id) do nothing;

-- Lecture réservée au propriétaire du chien (chemin : {dog_id}/{episode_id}.mp4).
create policy clips_owner_read on storage.objects
  for select using (
    bucket_id = 'clips'
    and exists (
      select 1 from public.dogs d
      where d.owner_id = auth.uid()
        and (storage.foldername(name))[1] = d.id::text
    )
  );
