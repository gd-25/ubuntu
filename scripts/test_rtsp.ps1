# M1 - Test du flux RTSP de la camera Tapo depuis le PC Windows (meme LAN obligatoire).
# Usage :  powershell -ExecutionPolicy Bypass -File test_rtsp.ps1 "rtsp://USER:PASS@192.168.1.50:554/stream2"
param([Parameter(Mandatory = $true)][string]$Url)
$ErrorActionPreference = "Stop"

foreach ($tool in @("ffprobe", "ffplay")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Write-Error "$tool introuvable. Installer ffmpeg :  winget install -e --id Gyan.FFmpeg  (puis rouvrir le terminal)"
  }
}

Write-Host "-> 1/3 Analyse des flux (ffprobe)..."
ffprobe -rtsp_transport tcp -v error -show_entries stream=codec_type,codec_name,sample_rate -of default=noprint_wrappers=1 $Url

Write-Host ""
Write-Host "-> 2/3 Verification de la piste audio..."
$audio = ffprobe -rtsp_transport tcp -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 $Url
if (-not $audio) {
  Write-Error "Aucune piste audio detectee ! Verifier dans l'app Tapo que le micro n'est pas desactive."
}
Write-Host "OK - Piste audio presente : $audio"

Write-Host ""
Write-Host "-> 3/3 Lecture live (ffplay) - fermer la fenetre pour terminer."
Write-Host "   Verifier : image visible + son audible (parler devant la camera)."
ffplay -rtsp_transport tcp -loglevel warning $Url
