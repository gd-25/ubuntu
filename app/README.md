# UBUNTU — Dog Alone Monitor 🐶

Application Expo (React Native) pour surveiller comment votre chien vit vos absences.
Un agent local écoute le flux audio d'une caméra et pousse des épisodes de vocalises
(aboiements / hurlements / gémissements) et des heartbeats vers Supabase ; l'app affiche
le direct, les sessions, l'historique et les tendances, et reçoit des notifications push.

## Démarrage

1. `cp .env.example .env` puis renseignez `EXPO_PUBLIC_SUPABASE_URL` et
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
2. `npm install`
3. `npx expo start`

## Vérifications

- `npm run typecheck` — TypeScript strict, sans émission.
- `npm run lint` — ESLint (config Expo).
- `npm test` — tests unitaires Jest (`jest-expo`).

## Configuration Supabase requise

- **Magic link / deep linking** : dans le dashboard Supabase (Authentication > URL
  Configuration), ajoutez `ubuntu://` (et l'URL Expo Go en dev, ex. `exp://127.0.0.1:8081`)
  aux *Redirect URLs*. Le schéma d'URL de l'app est `ubuntu` (voir `app.json`).
- **Realtime** : activez la réplication Realtime sur les tables `vocal_episodes` et
  `agent_heartbeats`.
- **Edge Function** : la fonction `close-session` doit être déployée ; l'app l'appelle
  à l'arrêt d'une session.

## Notifications push

L'enregistrement du token Expo nécessite un identifiant de projet EAS
(`extra.eas.projectId` dans `app.json`, généré par `eas init`) et un appareil physique.

## Structure

- `src/app` — routes Expo Router : onglets (Direct, Historique, Tendances, Réglages),
  `session/[id]` (détail), `login` (lien magique).
- `src/lib` — client Supabase, types de la base, contexte d'auth, notifications, formats
  (fuseau Europe/Paris).
- `src/components` — StatusBadge, EpisodeTimeline, StatCard, graphiques SVG faits main.
