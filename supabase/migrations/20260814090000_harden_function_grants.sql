-- Durcissement : les fonctions trigger SECURITY DEFINER ne doivent pas être
-- appelables via /rest/v1/rpc/ par anon/authenticated (advisor Supabase 0028/0029).
-- Les triggers continuent de fonctionner : l'exécution d'un trigger ne passe
-- pas par le droit EXECUTE de l'appelant. is_dog_member() reste exécutable :
-- il est évalué dans les policies RLS avec les droits de l'utilisateur.

revoke execute on function public.attach_episode_to_session() from public, anon, authenticated;
revoke execute on function public.attach_episodes_to_new_session() from public, anon, authenticated;
grant execute on function public.attach_episode_to_session() to service_role;
grant execute on function public.attach_episodes_to_new_session() to service_role;

-- notify_rules_webhook n'existe que sur le projet hébergé (webhook pg_net posé
-- à la main) — revoke conditionnel pour rester rejouable sur une base neuve.
do $$
begin
  if to_regprocedure('public.notify_rules_webhook()') is not null then
    revoke execute on function public.notify_rules_webhook() from public, anon, authenticated;
    grant execute on function public.notify_rules_webhook() to service_role;
  end if;
end $$;
