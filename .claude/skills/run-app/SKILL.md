---
name: run-app
description: Lancer et tester l'app UBUNTU (Expo) — simulateur iOS via Expo Go, dev build sur l'iPhone de Greg via Metro, vérifications, builds EAS et SQL Supabase. À utiliser dès qu'il faut voir l'app tourner ou itérer sur l'UI.
---

# Faire tourner l'app UBUNTU

L'app vit dans `app/` (Expo SDK 57, expo-router). Metro doit tourner sur le
**port 8082** (8081 est pris par thrift-connect).

## Metro (obligatoire pour tout)

```bash
cd app && nohup npx expo start --port 8082 > /tmp/metro-ubuntu.log 2>&1 &
```

Les modifs JS/TS se rechargent en direct (fast refresh) — pas de rebuild.

## Sur le simulateur iOS (Expo Go)

1. `xcrun simctl boot 730CE4BA-809D-4895-9567-D9F0AE53F2A4` (iPhone 15 Pro) puis `open -a Simulator`.
2. `xcrun simctl openurl booted "exp://127.0.0.1:8082"` (Expo Go y est déjà installé).
3. Écran de login : ajouter **temporairement** dans `src/app/login.tsx` un
   auto-login avec le compte de test `test-ota@example.com` / `test-password-123`
   (un `useEffect` qui appelle `supabase.auth.signInWithPassword`). **NE JAMAIS
   COMMITTER** — le retirer après le contrôle visuel. Ce compte n'a pas de
   chien : la carte s'affiche mais rien ne persiste.
4. Screenshot : `xcrun simctl io booted screenshot /tmp/sim.png` puis lire le PNG.

Limite : impossible de simuler un drag des avatars par script — le contrôle
visuel valide le rendu, Greg valide les gestes sur son téléphone.

## Sur l'iPhone de Greg (dev build)

Le dev build (expo-dev-client) est déjà installé. Il se connecte au Metro du
Mac (même wifi, réseau 192.168.1.x). Si la détection automatique échoue :
« Enter URL manually » → `http://192.168.1.222:8082` (vérifier l'IP avec
`ipconfig getifaddr en0`).

## Vérifications avant de committer

```bash
cd app && npm run typecheck && npm run lint && npm test
```

## Rebuild natif (seulement si on ajoute une lib native ou un plugin)

```bash
cd app && npx eas-cli build --profile development --platform ios --non-interactive
```

EAS est déjà loggé (compte `gregoire.deshusses`). Vérifier `npx expo-doctor`
avant : une peer dep native manquante (ex. expo-asset) = crash au démarrage
du build installé alors qu'Expo Go marche. Pas d'OTA (`eas update`) sans
demande explicite de Greg — crédits mensuels limités.

## SQL sur le Supabase hébergé (migrations)

Le CLI supabase pend dans ce shell ; passer par la Management API avec le
token du Keychain :

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/ecggmoualhaafcdbthke/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{"query":"<SQL>"}'
```

(Nécessite un shell hors sandbox pour lire le Keychain.) Toujours écrire la
migration correspondante dans `supabase/migrations/`.

## Géométrie de la carte

Le plan (zones, ancrages, murs) vit dans `app/src/lib/house.ts` (hit-test
`ZONE_RECTS` ordonné + `SLOTS`) et `app/src/components/house-map.tsx` (SVG).
Échelle : le lit fait 50×71 unités pour 140×200 cm (1 unité ≈ 2,8 cm).
Attention aux rects SVG à largeur/hauteur négative (ils se dessinent inversés
→ artefacts « fantômes ») et aux coins de murs : toujours faire affleurer les
segments (épaisseur uniforme 3 unités).
