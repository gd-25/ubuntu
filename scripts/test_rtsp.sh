#!/usr/bin/env bash
# M1 — Test du flux RTSP de la caméra Tapo depuis le PC (même LAN obligatoire).
#
# Usage :
#   ./scripts/test_rtsp.sh 'rtsp://USER:PASS@192.168.1.50:554/stream2'
#   (ou sans argument si CAMERA_RTSP_URL est défini dans agent/.env)
#
# Validé quand : ffprobe liste une piste audio ET ffplay affiche image + son.
set -euo pipefail

URL="${1:-}"
if [[ -z "$URL" && -f "$(dirname "$0")/../agent/.env" ]]; then
  URL=$(grep -E '^CAMERA_RTSP_URL=' "$(dirname "$0")/../agent/.env" | cut -d= -f2- || true)
fi
if [[ -z "$URL" ]]; then
  echo "Usage : $0 'rtsp://USER:PASS@CAMERA_IP:554/stream2'" >&2
  exit 1
fi

for tool in ffprobe ffplay; do
  if ! command -v "$tool" >/dev/null; then
    echo "✗ $tool introuvable. Installer ffmpeg :" >&2
    echo "    Debian/Ubuntu : sudo apt install ffmpeg" >&2
    echo "    macOS         : brew install ffmpeg" >&2
    exit 1
  fi
done

echo "→ 1/3 Analyse des flux (ffprobe)…"
ffprobe -rtsp_transport tcp -v error -show_entries stream=codec_type,codec_name,sample_rate \
  -of default=noprint_wrappers=1 "$URL"

echo
echo "→ 2/3 Vérification de la piste audio…"
AUDIO=$(ffprobe -rtsp_transport tcp -v error -select_streams a \
  -show_entries stream=codec_name -of csv=p=0 "$URL" || true)
if [[ -z "$AUDIO" ]]; then
  echo "✗ Aucune piste audio détectée !" >&2
  echo "  Vérifier dans l'app Tapo que le micro n'est pas désactivé." >&2
  exit 1
fi
echo "✓ Piste audio présente : $AUDIO"

echo
echo "→ 3/3 Lecture live (ffplay) — fermer la fenêtre pour terminer."
echo "  Vérifier : image visible + son audible (parler devant la caméra)."
ffplay -rtsp_transport tcp -loglevel warning "$URL"
