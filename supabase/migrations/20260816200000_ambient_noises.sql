-- « Autres bruits » : tous les sons entendus pendant une session de
-- solitude, y compris ceux que YAMNet n'a PAS retenus comme vocalises.
--
-- But : les couinements très faibles passent sous le seuil de détection.
-- Pendant quelques semaines, l'agent enregistre chaque bruit (clip vidéo
-- dans le bucket `clips`, sous-dossier {dog_id}/noises/) ; dans l'app, la
-- section « Autres bruits » du détail de session permet de dire « ça,
-- c'était un couinement » — la ligne est alors promue en vocalise et son
-- clip échappe à la purge. Le jeu de lignes promues servira à recalibrer
-- le détecteur.
--
-- Rétention : l'agent purge les clips et les lignes non promues de plus de
-- 30 jours (voir agent/noises.py).

create table public.ambient_noises (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- Volume max du bruit (RMS 0..1) — même échelle que vocal_episodes.
  peak_rms real,
  -- Meilleure classe YAMNet de la fenêtre la plus forte (indicatif).
  top_label text,
  -- Score « preuve chien » au moment du bruit : la variable à recalibrer.
  dog_score real,
  clip_path text,
  -- Marqué « c'était un couinement » depuis l'app : hors purge, et trace
  -- d'un couinement NON détecté par l'agent.
  promoted boolean not null default false,
  promoted_episode_id uuid references public.vocal_episodes (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Les bruits sont lus par plage horaire (ceux d'une session donnée).
create index ambient_noises_dog_started_at_idx
  on public.ambient_noises (dog_id, started_at);

alter table public.ambient_noises enable row level security;

create policy ambient_noises_member_all on public.ambient_noises
  for all using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));
