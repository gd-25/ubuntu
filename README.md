# UBUNTU — Dog Monitor 🐶

Track how a dog experiences daily life — alone time first, but also walks,
training, meals and nights. A Tapo camera films the room, an old laptop
listens to the audio stream and detects vocalizations (barking, howling,
whining), and a mobile app shows the live status, session history and trends,
and sends push notifications.

Beyond alone-time sessions, the app logs the whole routine: **walks** (with
duration and details), **training exercises**, false-cue desensitization
drills, meals, nights, dog-sitting, and "velcro" / semi-alone time — all
browsable in a unified journal with per-day notes, stats, and configurable
daily goals. An interactive pixel-art map of the home tracks where everyone
is, and an iOS lock-screen widget starts a session or logs a walk with one
tap.

```
[Tapo camera] --RTSP (audio) over LAN--> [Python agent on a spare PC]
                                              |  POST events (HTTPS)
                                              v
                                        [Supabase: Postgres + Edge Functions + Realtime + Auth]
                                              |  Realtime / REST        | Edge Function
                                              v                         v
                                    [React Native app (Expo)]    [Expo Push Notifications]
```

**Key principle: no raw video or audio ever leaves the house.** The agent
only sends JSON events (UTC timestamps + vocalization type + confidence).
The app displays everything in Europe/Paris time.

## Repository layout

| Folder | Contents |
|---|---|
| [`agent/`](agent/README.md) | Python agent: ffmpeg + YAMNet + hysteresis → episodes pushed to Supabase. Systemd unit + Windows fallback. |
| [`supabase/`](supabase/README.md) | SQL migrations (schema, RLS, triggers, `session_summaries` view) + Edge Functions (`close-session`, `notify-rules`, `ingest-episode`, `widget-actions`). |
| [`app/`](app/) | Expo app (TypeScript, Expo Router, Realtime, push, WidgetKit target). UI in French. |
| [`docs/`](docs/camera-setup.md) | Tapo camera setup. |
| [`scripts/`](scripts/test_rtsp.sh) | RTSP stream test (M1). |

## Getting started, milestone by milestone

1. **M1 — Camera**: follow [docs/camera-setup.md](docs/camera-setup.md), then run
   `./scripts/test_rtsp.sh 'rtsp://USER:PASS@IP:554/stream2'`. ✅ when you get image + sound on the PC.
2. **M2 — Detection**: install the agent ([agent/README.md](agent/README.md)) and run
   `python main.py --dry-run`. ✅ when barks show up in the console (calibrate the threshold).
3. **M3 — Backend**: `supabase db push`, then create the dog ([supabase/README.md](supabase/README.md));
   fill in `agent/.env` and run the agent without `--dry-run`. ✅ when episodes + heartbeats land in the database.
4. **M4 — App**: configure `app/.env`, `npx expo start`. Email/password auth,
   live screen, start/stop sessions, session detail, activity logging.
5. **M5 — Notifications**: deploy the Edge Functions + webhook, register the push
   token in Settings. ✅ when the push arrives on your phone.
6. **M6 — Hardening**: `systemctl enable --now ubuntu-agent`, Trends screen,
   lock-screen widget.

## Guardrails

- **Secrets are never committed** — `.env.example` files are provided
  (`agent/.env`, `app/.env`). The Supabase service role key lives only on the
  agent PC and in Edge Function env vars. The widget secret (`WIDGET_SECRET`)
  lives in Supabase secrets and EAS environment variables.
- The Supabase **URL and anon key** in `app/eas.json` are public by design
  (they ship inside the app binary); all data access is enforced by Postgres
  **row-level security** (owner + family-member policies on every table,
  private storage bucket with signed URLs).
- **Agent**: ≤ ~1 CPU core / 500 MB RAM, infinite RTSP reconnection with
  backoff, offline SQLite queue, honest `camera_unreachable` heartbeat when
  the stream drops.
- **Tests**: `cd agent && python -m pytest tests/` covers the episode logic
  (hysteresis, merging, durations) — the core of the system. App-side:
  `cd app && npm run typecheck && npm run lint && npm test`.
