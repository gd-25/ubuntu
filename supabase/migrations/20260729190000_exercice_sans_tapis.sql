-- L'Overall devient un simple « Exercice » de dressage : plus de
-- positionnement du tapis à l'enregistrement. Les colonnes tapis restent
-- pour les anciennes sessions mais deviennent optionnelles.

alter table public.overall_sessions alter column mat_x drop not null;
alter table public.overall_sessions alter column mat_y drop not null;
alter table public.overall_sessions alter column mat_space drop not null;

-- ------------------------------------------------------------- sessions

-- Localisation PAR PARTICIPANT pendant la session (Fiona peut être dans
-- le couloir pendant que Greg est en bas). `human_location` devient
-- legacy (les anciennes sessions le gardent en lecture).
alter table public.sessions
  add column greg_location text check (greg_location in ('couloir', 'en_bas', 'dehors')),
  add column fiona_location text check (fiona_location in ('couloir', 'en_bas', 'dehors'));
