-- Comptes famille : Fiona a son propre compte, associé à son avatar. Un
-- chien est partagé entre son propriétaire (Greg) et les membres listés
-- dans dog_members (avec l'avatar de chacun). Toutes les policies gagnent
-- un chemin « membre » en plus du chemin « propriétaire » existant.

-- ------------------------------------------------ Où est l'humain (SOLO)
-- Choisi dans le mini-picker juste après le départ : couloir / en bas de
-- l'immeuble / vraiment dehors.
alter table public.sessions add column human_location text
  check (human_location in ('couloir', 'en_bas', 'dehors'));

-- ---------------------------------------------------------- dog_members
create table public.dog_members (
  dog_id uuid not null references public.dogs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  person text not null check (person in ('greg', 'fiona')),
  created_at timestamptz not null default now(),
  primary key (dog_id, user_id)
);

alter table public.dog_members enable row level security;

-- Un membre lit sa propre ligne ; le propriétaire gère la liste.
create policy dog_members_self_read on public.dog_members
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.dogs d where d.id = dog_members.dog_id and d.owner_id = auth.uid())
  );
create policy dog_members_owner_write on public.dog_members
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_members.dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_members.dog_id and d.owner_id = auth.uid())
  );

-- SECURITY DEFINER : évite la récursion de RLS (la policy de dogs appelle
-- cette fonction qui relit dogs) — le owner de la fonction bypasse la RLS.
create or replace function public.is_dog_member(dog uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from dogs d where d.id = dog and d.owner_id = auth.uid())
      or exists (select 1 from dog_members m where m.dog_id = dog and m.user_id = auth.uid());
$$;

-- ------------------------------------- Chemin « membre » sur chaque table
create policy dogs_member_read on public.dogs
  for select using (public.is_dog_member(id));

create policy sessions_member_all on public.sessions
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create policy activities_member_all on public.activities
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create policy nights_member_all on public.nights
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create policy overall_sessions_member_all on public.overall_sessions
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create policy tags_member_all on public.tags
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create policy observed_events_member_all on public.observed_events
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create policy avatar_positions_member_all on public.avatar_positions
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create policy object_positions_member_all on public.object_positions
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create policy agent_heartbeats_member_read on public.agent_heartbeats
  for select using (public.is_dog_member(dog_id));

create policy session_tags_member_all on public.session_tags
  for all using (
    exists (select 1 from public.sessions s
            where s.id = session_tags.session_id and public.is_dog_member(s.dog_id))
  ) with check (
    exists (select 1 from public.sessions s
            where s.id = session_tags.session_id and public.is_dog_member(s.dog_id))
  );

create policy vocal_episodes_member_read on public.vocal_episodes
  for select using (public.is_dog_member(dog_id));
create policy vocal_episodes_member_insert_manual on public.vocal_episodes
  for insert with check (source = 'manual' and public.is_dog_member(dog_id));
create policy vocal_episodes_member_delete_manual on public.vocal_episodes
  for delete using (source = 'manual' and public.is_dog_member(dog_id));

-- Clips vidéo : lecture pour les membres aussi ({dog_id}/{episode_id}.mp4).
create policy clips_member_read on storage.objects
  for select using (
    bucket_id = 'clips'
    and public.is_dog_member(((storage.foldername(name))[1])::uuid)
  );
