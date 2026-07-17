-- Particularités de session : liste de tags par chien (éditable dans les
-- Réglages), assignables à chaque session depuis son détail.

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (dog_id, label)
);

create table public.session_tags (
  session_id uuid not null references public.sessions (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.session_tags enable row level security;

create policy tags_owner_all on public.tags
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

create policy session_tags_owner_all on public.session_tags
  for all using (
    exists (
      select 1 from public.sessions s
      join public.dogs d on d.id = s.dog_id
      where s.id = session_id and d.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.sessions s
      join public.dogs d on d.id = s.dog_id
      where s.id = session_id and d.owner_id = auth.uid()
    )
  );

-- Pré-remplissage pour les chiens existants.
insert into public.tags (dog_id, label)
select d.id, t.label
from public.dogs d
cross join (values ('Tapis de léchage'), ('Partir très soudainement'), ('Partir depuis le bureau')) as t(label)
on conflict (dog_id, label) do nothing;
