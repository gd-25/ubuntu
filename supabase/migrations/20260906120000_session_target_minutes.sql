-- Objectif de durée d'une session de solitude (choisi au lancement dans le
-- SoloPicker, suggéré par le palier de progression). Purement indicatif :
-- permet de distinguer « on visait 15 min » de « on a dû partir 2 h ».
alter table public.sessions
  add column if not exists target_minutes integer;
