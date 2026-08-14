-- Épisodes live : l'agent insère l'épisode dès son début puis l'étend.
-- peak_rms = volume max (RMS 0..1) produit pendant l'épisode — la variable
-- qui intéresse vraiment (l'intensité), plus que la famille bark/howl/whine.
alter table public.vocal_episodes add column if not exists peak_rms real;

-- NB : le webhook de notification (fonction notify_rules_webhook + triggers)
-- vit uniquement sur le projet hébergé (il contient le secret du webhook).
-- Avec les épisodes live, il écoute aussi l'UPDATE qui fait franchir à
-- l'épisode le seuil des 3 minutes (règle « épisode prolongé »).
