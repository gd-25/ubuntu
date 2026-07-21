-- Objets déplaçables sur le plan (tapis d'Ubuntu, panier), type de repas,
-- position du panier associée aux nuits.

-- ------------------------------------------------------ object_positions

-- Position exacte (unités carte) des objets déplaçables, synchronisée
-- entre les téléphones comme avatar_positions.
create table public.object_positions (
  dog_id uuid not null references public.dogs (id) on delete cascade,
  object text not null check (object in ('mat', 'basket')),
  x numeric not null,
  y numeric not null,
  updated_at timestamptz not null default now(),
  primary key (dog_id, object)
);

alter table public.object_positions enable row level security;

create policy object_positions_owner_all on public.object_positions
  for all using (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.dogs d where d.id = dog_id and d.owner_id = auth.uid())
  );

alter publication supabase_realtime add table public.object_positions;
alter table public.object_positions replica identity full;

-- ----------------------------------------------------------- activities

-- Repas : croquettes / pâté / autre.
alter table public.activities
  add column meal_kind text check (meal_kind in ('kibble', 'pate', 'other'));

-- ---------------------------------------------------------------- nights

-- Où était le panier cette nuit-là (variable de généralisation du dodo).
alter table public.nights add column basket_x numeric;
alter table public.nights add column basket_y numeric;
alter table public.nights add column basket_space text;
