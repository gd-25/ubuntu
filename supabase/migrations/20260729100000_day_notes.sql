-- Notes de journée du Journal : un texte libre par jour (ex. où était
-- Ubuntu s'il n'était pas à la maison). Éditées via le crayon à côté de
-- chaque jour, reprises dans l'export texte pour LLM.

create table public.day_notes (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  day date not null,
  content text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (dog_id, day)
);

alter table public.day_notes enable row level security;

create policy day_notes_member_all on public.day_notes
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));
