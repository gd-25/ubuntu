-- Épisodes « écartés » : faux positifs de YAMNet (marqué aboiement alors
-- que non). On les GARDE en base avec leur clip (futur jeu de données pour
-- affiner l'algo), mais ils sortent des stats et de la frise.
alter table public.vocal_episodes add column dismissed boolean not null default false;

-- Le propriétaire ET les membres peuvent écarter/restaurer un épisode de
-- l'agent (les manuels se suppriment, eux).
create policy vocal_episodes_member_dismiss on public.vocal_episodes
  for update using (public.is_dog_member(dog_id)) with check (public.is_dog_member(dog_id));

-- La vue exclut les épisodes écartés de toutes les statistiques.
create or replace view public.session_summaries as
 select s.id as session_id,
    s.dog_id,
    s.started_at,
    s.ended_at,
    s.trigger,
    s.notes,
    s.solitude_type,
    s.is_exercise,
    s.departure_state,
    s.departure_type,
    s.returned_during_vocalization,
    count(e.id)::integer as episode_count,
    coalesce(sum(extract(epoch from e.ended_at - e.started_at)), 0::numeric)::real as total_vocal_seconds,
    coalesce(sum(extract(epoch from e.ended_at - e.started_at)) filter (where e.kind = 'bark'::text), 0::numeric)::real as bark_seconds,
    coalesce(sum(extract(epoch from e.ended_at - e.started_at)) filter (where e.kind = 'howl'::text), 0::numeric)::real as howl_seconds,
    coalesce(sum(extract(epoch from e.ended_at - e.started_at)) filter (where e.kind = 'whine'::text), 0::numeric)::real as whine_seconds,
    coalesce(max(extract(epoch from e.ended_at - e.started_at)), 0::numeric)::real as longest_episode_seconds,
    extract(epoch from min(e.started_at) - s.started_at)::real as time_to_first_vocalization_seconds,
        case
            when extract(epoch from coalesce(s.ended_at, now()) - s.started_at) > 0::numeric then greatest(0::numeric, 100::numeric * (1::numeric - coalesce(sum(extract(epoch from e.ended_at - e.started_at)), 0::numeric) / extract(epoch from coalesce(s.ended_at, now()) - s.started_at)))::real
            else null::real
        end as calm_percent
   from public.sessions s
     left join public.vocal_episodes e on e.session_id = s.id and not e.dismissed
  group by s.id;

alter view public.session_summaries set (security_invoker = true);
