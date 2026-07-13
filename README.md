# UBUNTU — Dog Alone Monitor 🐶

Suivre comment le chien vit les moments seul à la maison : une caméra Tapo
filme la pièce, un vieux PC portable écoute le flux audio et détecte les
vocalises (aboiements, hurlements, gémissements), l'app mobile affiche l'état
en direct, l'historique des sessions, les tendances, et envoie des
notifications push.

```
[Caméra Tapo] --RTSP (audio) sur LAN--> [Agent Python sur PC Asus]
                                              |  POST événements (HTTPS)
                                              v
                                        [Supabase: Postgres + Edge Functions + Realtime + Auth]
                                              |  Realtime / REST        | Edge Function
                                              v                         v
                                    [App React Native (Expo)]    [Expo Push Notifications]
```

**Principe clé : aucune vidéo ni audio brut ne quitte la maison.** L'agent
n'envoie que des événements JSON (timestamps UTC + type de vocalise +
confiance). L'app affiche en Europe/Paris.

## Arborescence

| Dossier | Contenu |
|---|---|
| [`agent/`](agent/README.md) | Agent Python : ffmpeg + YAMNet + hystérésis → épisodes vers Supabase. Systemd + fallback Windows. |
| [`supabase/`](supabase/README.md) | Migration SQL (schéma, RLS, trigger, vue `session_summaries`) + Edge Functions (`close-session`, `notify-rules`, `ingest-episode`). |
| [`app/`](app/) | App Expo (TypeScript, Expo Router, Realtime, push). UI en français. |
| [`docs/`](docs/camera-setup.md) | Setup de la caméra Tapo. |
| [`scripts/`](scripts/test_rtsp.sh) | Test du flux RTSP (M1). |

## Mise en route, dans l'ordre des jalons

1. **M1 — Caméra** : suivre [docs/camera-setup.md](docs/camera-setup.md), puis
   `./scripts/test_rtsp.sh 'rtsp://USER:PASS@IP:554/stream2'`. ✅ quand image + son sur le PC.
2. **M2 — Détection** : installer l'agent ([agent/README.md](agent/README.md)) et lancer
   `python main.py --dry-run`. ✅ quand les aboiements s'affichent en console (calibrer le seuil).
3. **M3 — Backend** : `supabase db push` puis créer le chien ([supabase/README.md](supabase/README.md)) ;
   remplir `agent/.env` et lancer l'agent sans `--dry-run`. ✅ quand épisodes + heartbeats arrivent en base.
4. **M4 — App MVP** : configurer `app/.env`, `npx expo start`. Auth magic link,
   écran live, start/stop session, détail session.
5. **M5 — Notifs** : déployer les Edge Functions + webhook, enregistrer le token
   push dans Réglages. ✅ quand le push arrive sur le téléphone.
6. **M6 — Durcissement** : `systemctl enable --now ubuntu-agent`, écran Tendances.

## Garde-fous

- **Secrets** : jamais commités — des `.env.example` sont fournis partout
  (`agent/.env`, `app/.env`). La service key Supabase ne vit que sur le PC agent.
- **Agent** : ≤ ~1 cœur CPU / 500 Mo RAM, reconnexion RTSP infinie avec backoff,
  file offline SQLite, heartbeat `camera_unreachable` si le flux tombe.
- **Tests** : `cd agent && python -m pytest tests/` couvre la logique d'épisodes
  (hystérésis, fusion, durées) — le cœur métier.

## v2 (non implémenté, archi compatible)

Géofencing pour l'auto start/stop de session (`trigger='geofence'` déjà prévu),
upload de clips audio (`clip_path` déjà en base), analyse vidéo (Frigate).
