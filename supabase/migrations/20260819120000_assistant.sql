-- Assistant IA « expert canin » (anxiété de séparation) : conversations
-- partagées entre les membres du chien, mémoire interne vectorisée,
-- bibliothèque de documents (RAG pgvector) et extension d'activities pour
-- les saisies via l'assistant (entraînement d'ordres, incidents, santé,
-- notes libres). Les embeddings sont des mistral-embed (1024 dimensions).

create extension if not exists vector with schema extensions;

-- ------------------------------------------------------- conversations
create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  title text,
  created_by text check (created_by in ('greg', 'fiona')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assistant_conversations enable row level security;
create policy assistant_conversations_member_all on public.assistant_conversations
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

-- proposals : entrées structurées proposées par l'assistant (tool
-- propose_entries), en attente de validation dans l'app — c'est l'app qui
-- insère dans activities après le tap VALIDER, jamais l'assistant.
create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  author text check (author in ('greg', 'fiona')),
  proposals jsonb,
  proposal_status text check (proposal_status in ('pending', 'confirmed', 'dismissed')),
  created_at timestamptz not null default now()
);

create index assistant_messages_conversation_idx
  on public.assistant_messages (conversation_id, created_at);

alter table public.assistant_messages enable row level security;
create policy assistant_messages_member_all on public.assistant_messages
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

-- Un message remonte sa conversation en tête de liste.
create or replace function public.assistant_touch_conversation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update assistant_conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

create trigger assistant_messages_touch
  after insert on public.assistant_messages
  for each row execute function public.assistant_touch_conversation();

revoke execute on function public.assistant_touch_conversation() from public, anon, authenticated;
grant execute on function public.assistant_touch_conversation() to service_role;

-- ------------------------------------------------------------- mémoire
-- Faits durables extraits des conversations (ou dictés). La connaissance
-- est commune au foyer : un fait appris de Fiona sert aussi à Greg.
create table public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  content text not null,
  category text,
  source_conversation_id uuid references public.assistant_conversations (id) on delete set null,
  embedding extensions.vector(1024),
  created_at timestamptz not null default now()
);

alter table public.assistant_memories enable row level security;
create policy assistant_memories_member_all on public.assistant_memories
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create index assistant_memories_embedding_idx on public.assistant_memories
  using hnsw (embedding extensions.vector_cosine_ops);

-- SECURITY INVOKER : la RLS de assistant_memories s'applique à l'appelant.
create or replace function public.match_assistant_memories(
  dog uuid,
  query_embedding extensions.vector(1024),
  match_count int default 10
)
returns table (id uuid, content text, category text, created_at timestamptz, similarity double precision)
language sql
stable
set search_path = public, extensions
as $$
  select m.id, m.content, m.category, m.created_at,
         1 - (m.embedding <=> query_embedding) as similarity
  from assistant_memories m
  where m.dog_id = dog and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- ------------------------------------------ fiche du chien (toujours en contexte)
create table public.assistant_profiles (
  dog_id uuid primary key references public.dogs (id) on delete cascade,
  content text not null default '',
  updated_by text check (updated_by in ('greg', 'fiona')),
  updated_at timestamptz not null default now()
);

alter table public.assistant_profiles enable row level security;
create policy assistant_profiles_member_all on public.assistant_profiles
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

-- ------------------------------------------------- bibliothèque (RAG)
create table public.library_documents (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  title text not null,
  storage_path text not null,
  source_url text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
  error text,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.library_documents enable row level security;
create policy library_documents_member_all on public.library_documents
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create table public.library_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.library_documents (id) on delete cascade,
  dog_id uuid not null references public.dogs (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding extensions.vector(1024)
);

alter table public.library_chunks enable row level security;
create policy library_chunks_member_all on public.library_chunks
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

create index library_chunks_embedding_idx on public.library_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_library_chunks(
  dog uuid,
  query_embedding extensions.vector(1024),
  match_count int default 6
)
returns table (document_id uuid, title text, chunk_index int, content text, similarity double precision)
language sql
stable
set search_path = public, extensions
as $$
  select c.document_id, d.title, c.chunk_index, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from library_chunks c
  join library_documents d on d.id = c.document_id
  where c.dog_id = dog and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Bucket privé des documents ({dog_id}/{document_id}.pdf).
insert into storage.buckets (id, name, public)
values ('library', 'library', false)
on conflict (id) do nothing;

create policy library_member_read on storage.objects
  for select using (
    bucket_id = 'library'
    and public.is_dog_member(((storage.foldername(name))[1])::uuid)
  );
create policy library_member_insert on storage.objects
  for insert with check (
    bucket_id = 'library'
    and public.is_dog_member(((storage.foldername(name))[1])::uuid)
  );
create policy library_member_delete on storage.objects
  for delete using (
    bucket_id = 'library'
    and public.is_dog_member(((storage.foldername(name))[1])::uuid)
  );

-- ------------------------------------- activities : nouveaux kinds assistant
-- 'training' = ordre travaillé (commands + success_rating),
-- 'incident'  = événement notable (a tenté de grimper une chienne…),
-- 'health'    = santé/soins (véto, vermifuge, poids…),
-- 'note'      = fourre-tout quand rien d'autre ne colle.
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check
  check (kind in ('walk', 'meal', 'play', 'mat', 'fake_cue', 'care', 'velcro',
                  'training', 'incident', 'health', 'note', 'other'));

alter table public.activities add column commands text[];
alter table public.activities add column success_rating integer
  check (success_rating between 1 and 5);
alter table public.activities add column weight_kg numeric
  check (weight_kg > 0);
alter table public.activities add column created_via text not null default 'app'
  check (created_via in ('app', 'assistant'));
