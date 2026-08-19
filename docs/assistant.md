# L'Expert — assistant IA (RAG + mémoire + insertion validée)

Éducateur canin virtuel spécialisé anxiété de séparation, disponible dans
l'onglet 🧠 EXPERT de l'app. Tout tourne dans Supabase + l'API Mistral
(une seule clé, secret d'Edge Function `MISTRAL_API_KEY`) : aucun autre
backend.

## Architecture

```
app (Expo)
 ├─ POST /functions/v1/assistant-chat        ← SSE (meta/status/delta/done/error)
 │    └─ Mistral Large + tools ──────────────→ lectures via RLS (JWT utilisateur)
 │         get_sessions / get_session_detail    session_summaries, vocal_episodes…
 │         get_activities / get_nights /        activities (+ kinds training,
 │         get_exercises                        incident, health, note)
 │         search_library                       library_chunks (pgvector)
 │         save_memory / update_profile         assistant_memories / assistant_profiles
 │         propose_entries ──→ carte VALIDER dans l'app → INSERT activities
 │                              (c'est l'utilisateur qui écrit, jamais le LLM)
 ├─ POST /functions/v1/assistant-transcribe  ← dictée (Voxtral, m4a base64)
 └─ POST /functions/v1/assistant-ingest-doc  ← bibliothèque par URL (PDF/HTML/texte)
```

- **Modèles** : `mistral-large-latest` (conversation, surchargeable par le
  secret `MISTRAL_CHAT_MODEL`), `mistral-small-latest` (titres, extraction
  mémoire), `mistral-embed` (1024 dims), `voxtral-mini-latest` (dictée).
- **Mémoire à trois étages** : la fiche (`assistant_profiles`, toujours en
  contexte, éditable dans l'app), les faits durables (`assistant_memories`,
  extraits automatiquement après chaque échange, rappelés par similarité),
  et les données structurées (`activities` & co, requêtables — « combien de
  fois a-t-on travaillé stop » = `commands @> '{stop}'`).
- **Conversations partagées** : Greg et Fiona voient les mêmes conversations
  (RLS `is_dog_member`), l'assistant sait qui lui parle.
- **Écriture en base** : le tool `propose_entries` ne fait que proposer ;
  l'Edge Function normalise (heures de Paris → UTC, kinds validés) et l'app
  affiche une carte VALIDER/IGNORER. L'insert se fait avec la session de
  l'utilisateur (`created_via = 'assistant'`).
- **Bibliothèque** : ajout par URL depuis l'écran 📚 (téléchargement côté
  serveur → bucket privé `library` → chunks ~1600 caractères → pgvector,
  index HNSW). Les PDF locaux nécessiteraient expo-document-picker (module
  natif) : volontairement exclu pour rester compatible OTA.

## Pièges connus

- Expo Go < 57.0.9 crashe (SIGSEGV worklets) : laisser `expo start --go`
  installer la bonne version sur le simulateur.
- La réponse SSE est consommée avec `fetch` d'`expo/fetch` (streaming),
  pas le fetch global de React Native.
- `assistant-chat` insère le message assistant AVANT `waitUntil` (titre +
  extraction mémoire en arrière-plan).

## Phase 2 (à faire)

Coach proactif : pg_cron + Edge Function qui croise `greg_location`,
`dog_goals` et les sessions du jour → notifications dynamiques (« et si tu
laissais Boubou seul ? ») et résumé hebdo encourageant. Réutilise le même
prompt d'expert et les mêmes tools, déclenché par cron au lieu d'un message.
