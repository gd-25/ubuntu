#!/usr/bin/env python3
"""Agent local UBUNTU — écoute le flux RTSP de la caméra Tapo et pousse les
vocalises du chien (épisodes) + heartbeats vers Supabase.

Usage :
    python3 main.py               # mode normal (envoie vers Supabase)
    python3 main.py --dry-run     # log en console, n'envoie rien (calibration)

Config via fichier .env (voir .env.example) ou variables d'environnement.
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from detector import (
    HOP_DURATION,
    WINDOW_DURATION,
    EpisodeTracker,
    WindowResult,
    YamnetClassifier,
)
from uploader import Uploader

log = logging.getLogger("ubuntu")

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2  # s16le
HOP_BYTES = int(HOP_DURATION * SAMPLE_RATE) * BYTES_PER_SAMPLE
WINDOW_BYTES = int(WINDOW_DURATION * SAMPLE_RATE) * BYTES_PER_SAMPLE
HEARTBEAT_INTERVAL = 60  # s
MAX_RTSP_BACKOFF = 60  # s


def load_env(path: Path) -> None:
    """Charge un fichier .env minimaliste (KEY=VALUE) sans écraser l'environnement."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def utc_iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


class Agent:
    def __init__(self, args: argparse.Namespace):
        self.rtsp_url = os.environ.get("CAMERA_RTSP_URL", "")
        self.dog_id = os.environ.get("DOG_ID", "")
        self.device_name = os.environ.get("DEVICE_NAME", "asus-agent")
        threshold = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.3"))
        self.dry_run = args.dry_run

        if not self.rtsp_url:
            sys.exit("CAMERA_RTSP_URL manquant (voir .env.example)")
        if not self.dry_run:
            for var in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY", "DOG_ID"):
                if not os.environ.get(var):
                    sys.exit(f"{var} manquant (voir .env.example)")

        base = Path(__file__).resolve().parent
        self.tracker = EpisodeTracker(threshold=threshold)
        self.classifier = YamnetClassifier(
            model_path=str(base / "models" / "yamnet.tflite"),
            class_map_path=str(base / "models" / "yamnet_class_map.csv"),
        )
        self.uploader = Uploader(
            supabase_url=os.environ.get("SUPABASE_URL", ""),
            service_key=os.environ.get("SUPABASE_SERVICE_KEY", ""),
            queue_path=str(base / "queue.db"),
            dry_run=self.dry_run,
        )

        self.started_at = time.time()
        self.stream_alive = False
        self.last_rms = 0.0
        self._stop = threading.Event()
        # Le tracker est partagé entre la boucle d'écoute et le thread heartbeat.
        self._tracker_lock = threading.Lock()

    # ------------------------------------------------------------ lifecycle

    def run(self) -> None:
        signal.signal(signal.SIGINT, self._on_signal)
        signal.signal(signal.SIGTERM, self._on_signal)

        self.uploader.start()
        heartbeat = threading.Thread(
            target=self._heartbeat_loop, daemon=True, name="heartbeat"
        )
        heartbeat.start()

        backoff = 1.0
        while not self._stop.is_set():
            started = time.time()
            try:
                self._listen_once()
            except Exception:
                log.exception("erreur inattendue dans la boucle d'écoute")
            self.stream_alive = False
            with self._tracker_lock:
                episodes = self.tracker.flush()
            self._emit(episodes)
            if self._stop.is_set():
                break
            # Connexion stable pendant > 1 min : on repart d'un backoff court.
            if time.time() - started > 60:
                backoff = 1.0
            log.warning("flux RTSP perdu, reconnexion dans %.0fs", backoff)
            if self._stop.wait(timeout=backoff):
                break
            backoff = min(backoff * 2, MAX_RTSP_BACKOFF)

        with self._tracker_lock:
            episodes = self.tracker.flush()
        self._emit(episodes)
        self.uploader.stop()
        log.info("agent arrêté proprement")

    def _on_signal(self, signum, _frame) -> None:
        log.info("signal %s reçu, arrêt en cours…", signum)
        self._stop.set()

    # ------------------------------------------------------------ pipeline

    def _listen_once(self) -> None:
        """Une session de connexion : lance ffmpeg et consomme l'audio jusqu'à la panne."""
        import numpy as np

        cmd = [
            "ffmpeg",
            "-nostdin",
            "-loglevel", "error",
            "-rtsp_transport", "tcp",
            "-i", self.rtsp_url,
            "-vn",
            "-ac", "1",
            "-ar", str(SAMPLE_RATE),
            "-f", "s16le",
            "-",
        ]
        log.info("connexion au flux RTSP…")
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        buffer = bytearray()
        try:
            while not self._stop.is_set():
                chunk = proc.stdout.read(HOP_BYTES)
                if not chunk:
                    break
                if not self.stream_alive:
                    self.stream_alive = True
                    log.info("flux RTSP connecté, écoute en cours")
                buffer.extend(chunk)
                # Garde exactement une fenêtre glissante.
                if len(buffer) > WINDOW_BYTES:
                    del buffer[: len(buffer) - WINDOW_BYTES]
                if len(buffer) < WINDOW_BYTES:
                    continue

                now = time.time()
                samples = (
                    np.frombuffer(bytes(buffer), dtype=np.int16).astype(np.float32)
                    / 32768.0
                )
                self.last_rms = float(np.sqrt(np.mean(samples**2)))
                confidence, family_scores = self.classifier.classify(samples)
                window = WindowResult(
                    timestamp=now - WINDOW_DURATION,
                    confidence=confidence,
                    family_scores=family_scores,
                )
                if self.dry_run and confidence >= self.tracker.threshold:
                    best = max(family_scores, key=lambda k: family_scores[k])
                    log.info(
                        "🐶 fenêtre positive  conf=%.2f  famille=%s  scores=%s",
                        confidence,
                        best,
                        {k: round(v, 2) for k, v in family_scores.items()},
                    )
                with self._tracker_lock:
                    episodes = self.tracker.push(window)
                self._emit(episodes)
        finally:
            stderr = b""
            try:
                proc.kill()
                _, stderr = proc.communicate(timeout=5)
            except Exception:
                pass
            if stderr:
                log.warning("ffmpeg : %s", stderr.decode(errors="replace").strip()[-500:])

    def _emit(self, episodes) -> None:
        for ep in episodes:
            log.info(
                "🔊 épisode %s  %.1fs  avg=%.2f  peak=%.2f  (%s → %s)",
                ep.kind,
                ep.duration,
                ep.avg_confidence,
                ep.peak_confidence,
                utc_iso(ep.started_at),
                utc_iso(ep.ended_at),
            )
            self.uploader.enqueue_episode(
                {
                    "dog_id": self.dog_id or None,
                    "started_at": utc_iso(ep.started_at),
                    "ended_at": utc_iso(ep.ended_at),
                    "kind": ep.kind,
                    "avg_confidence": ep.avg_confidence,
                    "peak_confidence": ep.peak_confidence,
                }
            )

    # ------------------------------------------------------------ heartbeat

    def _heartbeat_loop(self) -> None:
        while not self._stop.wait(timeout=HEARTBEAT_INTERVAL):
            # poll() permet d'émettre un épisode en attente de fusion même si
            # le flux est silencieux ou coupé.
            with self._tracker_lock:
                episodes = self.tracker.poll(time.time())
            self._emit(episodes)
            status = "listening" if self.stream_alive else "camera_unreachable"
            self.uploader.send_heartbeat(
                {
                    "dog_id": self.dog_id or None,
                    "at": utc_iso(time.time()),
                    "status": status,
                    "rms_level": round(self.last_rms, 5),
                }
            )
            log.debug(
                "heartbeat status=%s rms=%.4f uptime=%.0fs file=%d",
                status,
                self.last_rms,
                time.time() - self.started_at,
                self.uploader.queue_size(),
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Agent UBUNTU — Dog Alone Monitor")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="log les classifications en console sans rien envoyer (calibration)",
    )
    parser.add_argument(
        "--env",
        default=str(Path(__file__).resolve().parent / ".env"),
        help="chemin du fichier .env (défaut : ./agent/.env)",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="logs debug")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s  %(message)s",
        datefmt="%H:%M:%S",
    )
    load_env(Path(args.env))
    Agent(args).run()


if __name__ == "__main__":
    main()
