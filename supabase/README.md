# Backend Supabase (M3 + M5)

## Setup initial

```bash
# Depuis la racine du projet
supabase init          # génère supabase/config.toml (garder nos migrations/functions)
supabase login
supabase link --project-ref <PROJECT_REF>

# Appliquer le schéma (tables, RLS, trigger, vue, realtime)
supabase db push
```

Puis créer le chien (SQL Editor du dashboard, une fois connecté dans l'app
pour que `auth.users` contienne votre utilisateur) :

```sql
insert into dogs (owner_id, name)
values ((select id from auth.users limit 1), 'Milo')
returning id;   -- → DOG_ID à mettre dans agent/.env
```

> L'app propose aussi la création du chien depuis l'écran Réglages.

## Edge Functions (M5)

```bash
# Secrets partagés des fonctions
supabase secrets set \
  WEBHOOK_SECRET=$(openssl rand -hex 24) \
  AGENT_SECRET=$(openssl rand -hex 24) \
  NOTIFY_MIN_EPISODE_MINUTES=3 \
  NOTIFY_FIRST_EPISODE=true

# Déploiement
supabase functions deploy close-session                     # JWT utilisateur vérifié
supabase functions deploy notify-rules --no-verify-jwt      # protégée par WEBHOOK_SECRET
supabase functions deploy ingest-episode --no-verify-jwt    # protégée par AGENT_SECRET
```

### Webhook base de données → notify-rules

Dashboard → **Database → Webhooks** → Create :

- Table : `vocal_episodes`, événement : **INSERT**
- Type : HTTP Request, méthode POST
- URL : `https://<PROJECT_REF>.functions.supabase.co/notify-rules`
- Header : `x-webhook-secret: <WEBHOOK_SECRET>`

## Règles de notification

| Règle | Déclencheur | Message |
|---|---|---|
| `long_episode` | épisode ≥ `NOTIFY_MIN_EPISODE_MINUTES` (défaut 3 min) | « Ça fait X min qu'il aboie » |
| `first_episode` | premier épisode d'une session (désactivable via `NOTIFY_FIRST_EPISODE=false`) | « Première vocalise depuis ton départ » |
| récap | fin de session (`close-session`) | « Milo est resté seul 2 h 10, il a vocalisé 14 min sur 8 épisodes » |

Anti-spam : max 1 notification / 10 minutes / règle (table `notification_log`).

## Notes d'architecture

- L'agent écrit **directement** via PostgREST avec la service key (choix v1,
  le plus simple). `ingest-episode` est l'alternative recommandée si on veut
  validation + notifs sans webhook : pointer l'agent dessus avec le header
  `x-agent-secret` au lieu de l'API REST.
- Le trigger `vocal_episodes_attach_session` rattache chaque épisode à la
  session ouverte du chien ; les épisodes hors session gardent `session_id null`
  (conservés : le chien vocalise aussi quand on est là).
- La vue `session_summaries` porte les métriques clés, dont le
  **time-to-first-vocalization** (anxiété de séparation) et le % de temps calme.
- RLS owner-only partout ; l'app lit avec la clé anon + JWT, l'agent écrit en
  service role.
