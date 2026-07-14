"""Clips vidéo par épisode.

Le ffmpeg principal (voir main.py) écrit en continu des segments vidéo+audio
de SEGMENT_SECONDS dans un tampon circulaire sur disque. À chaque épisode,
ClipRecorder assemble les segments couvrant [début - preroll, fin + postroll],
les remuxe en mp4 (vidéo copiée, audio réencodé en AAC — l'a-law Tapo n'est
pas valide en mp4), uploade vers Supabase Storage (bucket `clips`, chemin
{dog_id}/{episode_id}.mp4) puis renseigne clip_path sur l'épisode.

Tout tourne dans un thread dédié : l'assemblage attend la clôture du dernier
segment (jusqu'à ~15 s) sans bloquer la boucle audio.
"""

from __future__ import annotations

import logging
import queue
import subprocess
import tempfile
import threading
import time
from pathlib import Path

import requests

log = logging.getLogger("ubuntu.clips")

SEGMENT_SECONDS = 4
# Tampon : de quoi couvrir le preroll + un épisode long en attente de fusion.
BUFFER_SECONDS = 150
FINAL_SEGMENT_TIMEOUT = 15  # s d'attente max du segment couvrant la fin
UPLOAD_TIMEOUT = 60  # s


def segment_output_args(clip_dir: Path) -> list[str]:
    """Sortie ffmpeg supplémentaire : segments vidéo+audio en tampon circulaire.

    Matroska plutôt que TS/MP4 : supporte l'a-law Tapo tel quel en copie.
    """
    return [
        "-map", "0",
        "-c", "copy",
        "-f", "segment",
        "-segment_time", str(SEGMENT_SECONDS),
        "-segment_format", "matroska",
        "-reset_timestamps", "1",
        str(clip_dir / "seg_%06d.mkv"),
    ]


def pick_segments(
    segments: list[tuple[Path, float]],
    clip_start: float,
    clip_end: float,
    segment_seconds: float = SEGMENT_SECONDS,
) -> list[Path]:
    """Sélectionne les segments couvrant [clip_start, clip_end].

    `segments` : [(chemin, mtime)] où mtime ≈ heure de FIN du segment (le
    fichier est clos quand le segment se termine). Pure : testé unitairement.
    """
    picked = [
        (mtime, path)
        for path, mtime in segments
        if mtime >= clip_start and mtime - segment_seconds <= clip_end
    ]
    return [path for _, path in sorted(picked)]


class ClipRecorder:
    def __init__(
        self,
        clip_dir: Path,
        supabase_url: str,
        service_key: str,
        dog_id: str,
        on_uploaded,  # callable(episode_id, clip_path)
        preroll: float = 4.0,
        postroll: float = 2.0,
    ):
        self.clip_dir = clip_dir
        self.storage_url = supabase_url.rstrip("/") + "/storage/v1/object/clips"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "video/mp4",
            "x-upsert": "true",
        }
        self.dog_id = dog_id
        self.on_uploaded = on_uploaded
        self.preroll = preroll
        self.postroll = postroll

        self._queue: queue.Queue[tuple[str, float, float] | None] = queue.Queue()
        self._worker = threading.Thread(target=self._run, daemon=True, name="clips")

        self.clip_dir.mkdir(parents=True, exist_ok=True)
        for old in self.clip_dir.glob("seg_*.mkv"):
            old.unlink(missing_ok=True)

    def start(self) -> None:
        self._worker.start()

    def stop(self) -> None:
        self._queue.put(None)
        self._worker.join(timeout=10)

    def request(self, episode_id: str, started_at: float, ended_at: float) -> None:
        """Demande un clip pour un épisode (non bloquant)."""
        self._queue.put((episode_id, started_at, ended_at))

    # ---------------------------------------------------------------- worker

    def _run(self) -> None:
        while True:
            try:
                item = self._queue.get(timeout=30)
            except queue.Empty:
                self._cleanup()
                continue
            if item is None:
                return
            episode_id, started_at, ended_at = item
            try:
                self._make_clip(episode_id, started_at, ended_at)
            except Exception:
                log.exception("clip %s : échec", episode_id)
            self._cleanup()

    def _segments(self) -> list[tuple[Path, float]]:
        return [(p, p.stat().st_mtime) for p in self.clip_dir.glob("seg_*.mkv")]

    def _cleanup(self) -> None:
        cutoff = time.time() - BUFFER_SECONDS
        for path, mtime in self._segments():
            if mtime < cutoff:
                path.unlink(missing_ok=True)

    def _make_clip(self, episode_id: str, started_at: float, ended_at: float) -> None:
        clip_start = started_at - self.preroll
        clip_end = ended_at + self.postroll

        # Attend que le segment couvrant la fin du clip soit clos.
        deadline = time.time() + FINAL_SEGMENT_TIMEOUT
        while time.time() < deadline:
            if any(mtime >= clip_end for _, mtime in self._segments()):
                break
            time.sleep(0.5)

        paths = pick_segments(self._segments(), clip_start, clip_end)
        if not paths:
            log.warning("clip %s : aucun segment disponible", episode_id)
            return

        with tempfile.TemporaryDirectory() as tmp:
            concat_list = Path(tmp) / "list.txt"
            concat_list.write_text(
                "".join(f"file '{p.as_posix()}'\n" for p in paths), encoding="utf-8"
            )
            out = Path(tmp) / f"{episode_id}.mp4"
            cmd = [
                "ffmpeg", "-nostdin", "-loglevel", "error",
                "-f", "concat", "-safe", "0", "-i", str(concat_list),
                "-c:v", "copy", "-c:a", "aac", "-b:a", "48k",
                "-movflags", "+faststart",
                str(out),
            ]
            result = subprocess.run(cmd, capture_output=True, timeout=60)
            if result.returncode != 0 or not out.exists():
                log.warning(
                    "clip %s : remux échoué (%s)",
                    episode_id,
                    result.stderr.decode(errors="replace")[-300:],
                )
                return
            self._upload(episode_id, out)

    def _upload(self, episode_id: str, mp4: Path) -> None:
        clip_path = f"{self.dog_id}/{episode_id}.mp4"
        try:
            resp = requests.post(
                f"{self.storage_url}/{clip_path}",
                headers=self.headers,
                data=mp4.read_bytes(),
                timeout=UPLOAD_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            log.warning("clip %s : upload échoué (%s)", episode_id, exc)
            return
        log.info("🎬 clip uploadé : %s (%.0f ko)", clip_path, mp4.stat().st_size / 1024)
        self.on_uploaded(episode_id, clip_path)
