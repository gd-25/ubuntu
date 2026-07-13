# Agent local UBUNTU (PC Asus)

Écoute le flux audio RTSP de la caméra Tapo, détecte les vocalises du chien
(YAMNet) et pousse épisodes + heartbeats vers Supabase. Aucune vidéo ni audio
brut ne quitte la maison : seulement des événements JSON.

## Installation (Linux — cible principale)

```bash
sudo apt install ffmpeg python3-venv    # Debian/Ubuntu

cd agent
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
./download_model.sh                     # télécharge YAMNet dans agent/models/

cp .env.example .env                    # puis remplir (RTSP, Supabase, DOG_ID)
```

## Calibration (M2) — mode dry-run

```bash
./venv/bin/python main.py --dry-run
```

Rien n'est envoyé : les fenêtres positives et les épisodes sont loggés en
console. Taquiner le chien (sonnette, bruit de croquettes…) et ajuster
`CONFIDENCE_THRESHOLD` dans `.env` (défaut 0.3) : plus bas = plus sensible.

## Lancement en service (M6)

```bash
sudo cp ubuntu-agent.service /etc/systemd/system/   # adapter User= et les chemins
sudo systemctl daemon-reload
sudo systemctl enable --now ubuntu-agent
journalctl -u ubuntu-agent -f                        # logs
```

`Restart=always` + reconnexion RTSP interne (backoff 1 → 60 s) : l'agent
survit aux reboots caméra, coupures Wi-Fi et crashs.

## Windows (fallback)

1. Installer les prérequis (PowerShell) puis **rouvrir le terminal** :
   ```powershell
   winget install -e --id Python.Python.3.12
   winget install -e --id Git.Git
   winget install -e --id Gyan.FFmpeg
   ```
2. Dans `agent\` :
   ```powershell
   py -3.12 -m venv venv
   .\venv\Scripts\pip install -r requirements.txt
   .\venv\Scripts\pip install tensorflow    # remplace tflite-runtime (Linux only)
   powershell -ExecutionPolicy Bypass -File download_model.ps1
   copy .env.example .env                   # puis remplir
   ```
3. Calibration : `.\venv\Scripts\python main.py --dry-run`
4. Lancer `run.bat` (boucle avec redémarrage auto). Pour le démarrage au boot :
   Planificateur de tâches → déclencheur « Au démarrage » → action `run.bat`,
   cocher « Exécuter même si l'utilisateur n'est pas connecté ». Désactiver la
   mise en veille dans les paramètres d'alimentation.

## Comportement

- **Pipeline** : ffmpeg extrait l'audio (PCM 16 kHz mono) → fenêtres YAMNet de
  0,975 s toutes les 0,5 s → hystérésis (vocalise si ≥ 3/5 fenêtres positives,
  calme après ≥ 8 négatives ≈ 4 s) → épisodes `{started_at, ended_at, kind,
  avg_confidence, peak_confidence}`.
- Épisodes < 1 s ignorés ; épisodes séparés de < 5 s fusionnés.
- **Heartbeat** toutes les 60 s (`listening` / `camera_unreachable`, niveau RMS).
- **File offline** : les épisodes non envoyés sont stockés dans `queue.db`
  (SQLite) et rejoués à la reconnexion avec backoff exponentiel.
- Empreinte visée : ~1 cœur CPU, < 500 Mo RAM (bornés par systemd).

## Tests

```bash
./venv/bin/python -m pytest tests/ -v
```

Couvre le cœur métier : hystérésis, fusion d'épisodes, durées minimales,
vote de famille (bark/howl/whine), stats de confiance.

## Fichiers

| Fichier | Rôle |
|---|---|
| `main.py` | boucle principale : ffmpeg, reconnexion, heartbeats, signaux |
| `detector.py` | classification YAMNet + machine à états des épisodes |
| `uploader.py` | file SQLite + envoi PostgREST (service key) |
| `ubuntu-agent.service` | unité systemd (`Restart=always`, limites CPU/RAM) |
| `run.bat` | fallback Windows |
| `download_model.sh` | récupère `yamnet.tflite` + table des classes |
