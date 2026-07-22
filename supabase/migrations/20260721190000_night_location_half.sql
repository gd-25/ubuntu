-- La nuit se note désormais relativement à la chambre (la position exacte
-- vient du panier) : nouveau choix « moitié moitié ». Les anciennes valeurs
-- restent valides pour les nuits déjà enregistrées (on_bed est un legacy).
alter table public.nights drop constraint nights_location_check;
alter table public.nights add constraint nights_location_check
  check (location in ('outside_room', 'in_room', 'on_bed', 'half_half'));
