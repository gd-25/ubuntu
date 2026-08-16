"""Capture des « autres bruits » d'une session de solitude.

Le détecteur YAMNet rate les couinements très faibles. En attendant de le
recalibrer, l'agent enregistre TOUS les bruits entendus pendant une session
(voir NoiseTracker dans detector.py) : un clip vidéo par bruit dans le
bucket `clips`, sous-dossier `{dog_id}/noises/`, et une ligne
`ambient_noises`. Dans l'app, le détail de session affiche ces bruits tout
en bas ; un bouton « couinement » promeut la ligne en vraie vocalise et met
son clip à l'abri de la purge.

Le bucket `clips` est réutilisé (plutôt qu'un bucket séparé) pour deux
raisons : ses policies RLS membres existent déjà, et un bruit promu garde
son clip lisible par le lecteur de l'app sans le déplacer. La « durée de
vie » demandée est assurée par `purge_old_noises` : 30 jours pour les
clips et les lignes non promus.
"""

from __future__ import annotations

import logging
import queue
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

from clips import build_mp4, pick_segments, wait_for_final_segment
from detector import Noise

log = logging.getLogger("ubuntu.noises")

UPLOAD_TIMEOUT = 60  # s
REQUEST_TIMEOUT = 15  # s
RETENTION_DAYS = 30
PURGE_BATCH = 200


class NoiseRecorder:
    """Clip + ligne `ambient_noises` pour chaque bruit non détecté.

    Tourne dans son propre thread : il partage le tampon de segments du
    ClipRecorder (même dossier, même ffmpeg) mais n'y touche jamais en
    écriture — le nettoyage reste la responsabilité du ClipRecorder.
    """

    def __init__(
        self,
        clip_dir: Path,
        supabase_url: str,
        service_key: str,
        dog_id: str,
        should_record,  # callable() -> bool : une session est-elle ouverte ?
        preroll: float = 2.0,
        postroll: float = 2.0,
    ):
        self.clip_dir = clip_dir
        self.base_url = supabase_url.rstrip("/")
        self.service_key = service_key
        self.dog_id = dog_id
        self.should_record = should_record
        self.preroll = preroll
        self.postroll = postroll

        self._queue: queue.Queue[Noise | None] = queue.Queue()
        self._worker = threading.Thread(target=self._run, daemon=True, name="noises")

    # ---------------------------------------------------------------- public

    def start(self) -> None:
        self._worker.start()

    def stop(self) -> None:
        self._queue.put(None)
        self._worker.join(timeout=10)

    def request(self, noise: Noise) -> None:
        """Enregistre un bruit (non bloquant — la session est vérifiée après)."""
        self._queue.put(noise)

    # ---------------------------------------------------------------- worker

    def _segments(self) -> list[tuple[Path, float]]:
        return [(p, p.stat().st_mtime) for p in self.clip_dir.glob("seg_*.mkv")]

    def _run(self) -> None:
        while True:
            noise = self._queue.get()
            if noise is None:
                return
            try:
                # Hors session (nuit, absence non loggée) : on ne garde rien —
                # la capture ne sert qu'à réviser les sessions de solitude.
                if not self.should_record():
                    continue
                self._capture(noise)
            except Exception:
                log.exception("bruit %s : échec", noise.noise_id[:8])

    def _capture(self, noise: Noise) -> None:
        clip_start = noise.started_at - self.preroll
        clip_end = noise.ended_at + self.postroll
        wait_for_final_segment(self._segments, clip_end)
        paths = pick_segments(self._segments(), clip_start, clip_end)
        if not paths:
            log.warning("bruit %s : aucun segment disponible", noise.noise_id[:8])
            return

        clip_path = f"{self.dog_id}/noises/{noise.noise_id}.mp4"
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / f"{noise.noise_id}.mp4"
            if not build_mp4(paths, out):
                return
            if not self._upload(clip_path, out):
                return
        self._insert_row(noise, clip_path)
        log.info(
            "🔈 autre bruit %s  %.1fs  rms=%.4f  top=%s",
            noise.noise_id[:8],
            noise.duration,
            noise.peak_rms,
            noise.top_label or "?",
        )

    def _upload(self, clip_path: str, mp4: Path) -> bool:
        try:
            resp = requests.post(
                f"{self.base_url}/storage/v1/object/clips/{clip_path}",
                headers={
                    "apikey": self.service_key,
                    "Authorization": f"Bearer {self.service_key}",
                    "Content-Type": "video/mp4",
                    "x-upsert": "true",
                },
                data=mp4.read_bytes(),
                timeout=UPLOAD_TIMEOUT,
            )
            resp.raise_for_status()
            return True
        except requests.RequestException as exc:
            log.warning("bruit %s : upload échoué (%s)", clip_path, exc)
            return False

    def _insert_row(self, noise: Noise, clip_path: str) -> None:
        """La ligne n'est écrite qu'APRÈS l'upload : jamais de bruit sans clip
        (l'inverse — un clip orphelin — est rattrapé par la purge)."""
        payload = {
            "id": noise.noise_id,
            "dog_id": self.dog_id,
            "started_at": _utc_iso(noise.started_at),
            "ended_at": _utc_iso(noise.ended_at),
            "peak_rms": round(noise.peak_rms, 5),
            "top_label": noise.top_label or None,
            "dog_score": round(noise.dog_score, 4),
            "clip_path": clip_path,
        }
        try:
            resp = requests.post(
                f"{self.base_url}/rest/v1/ambient_noises",
                headers={
                    "apikey": self.service_key,
                    "Authorization": f"Bearer {self.service_key}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal,resolution=merge-duplicates",
                },
                json=payload,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            log.warning("bruit %s : insert échoué (%s)", noise.noise_id[:8], exc)


def _utc_iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def purge_old_noises(
    supabase_url: str,
    service_key: str,
    dog_id: str,
    retention_days: int = RETENTION_DAYS,
) -> int:
    """Supprime clips et lignes des bruits NON promus de plus de N jours.

    C'est la « durée de vie » du stockage temporaire : un bruit promu en
    couinement garde son clip indéfiniment (jeu de données de recalibration).
    Renvoie le nombre de bruits purgés.
    """
    base = supabase_url.rstrip("/")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }
    cutoff = (datetime.now(timezone.utc) - timedelta(days=retention_days)).isoformat()
    try:
        resp = requests.get(
            f"{base}/rest/v1/ambient_noises",
            params={
                "dog_id": f"eq.{dog_id}",
                "promoted": "is.false",
                "started_at": f"lt.{cutoff}",
                "select": "id,clip_path",
                "limit": str(PURGE_BATCH),
            },
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        rows = resp.json()
    except (requests.RequestException, ValueError) as exc:
        log.warning("purge des bruits : lecture impossible (%s)", exc)
        return 0
    if not rows:
        return 0

    prefixes = [row["clip_path"] for row in rows if row.get("clip_path")]
    if prefixes:
        try:
            resp = requests.delete(
                f"{base}/storage/v1/object/clips",
                headers=headers,
                json={"prefixes": prefixes},
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            # On garde les lignes : la purge repassera demain.
            log.warning("purge des bruits : suppression des clips impossible (%s)", exc)
            return 0

    ids = ",".join(row["id"] for row in rows)
    try:
        resp = requests.delete(
            f"{base}/rest/v1/ambient_noises",
            params={"id": f"in.({ids})"},
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        log.warning("purge des bruits : suppression des lignes impossible (%s)", exc)
        return 0
    log.info("🧹 %d bruit(s) de plus de %d jours purgé(s)", len(rows), retention_days)
    return len(rows)
