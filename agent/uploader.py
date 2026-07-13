"""Envoi des événements vers Supabase (PostgREST) avec file locale SQLite.

- Les épisodes passent par une file SQLite persistante : si Internet est coupé,
  ils sont rejoués à la reconnexion (retry avec backoff exponentiel).
- Les heartbeats sont envoyés en direct et jetés en cas d'échec : un heartbeat
  périmé n'a aucune valeur.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import threading
import time

import requests

log = logging.getLogger("ubuntu.uploader")

MAX_BACKOFF = 300  # 5 min
REQUEST_TIMEOUT = 10  # s
BATCH_SIZE = 50


class Uploader:
    def __init__(
        self,
        supabase_url: str,
        service_key: str,
        queue_path: str = "queue.db",
        dry_run: bool = False,
    ):
        self.base_url = supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }
        self.dry_run = dry_run
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._wakeup = threading.Event()

        self._db = sqlite3.connect(queue_path, check_same_thread=False)
        self._db.execute(
            """
            CREATE TABLE IF NOT EXISTS pending_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                table_name TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at REAL NOT NULL
            )
            """
        )
        self._db.commit()

        self._worker = threading.Thread(target=self._run, daemon=True, name="uploader")

    # ---------------------------------------------------------------- public

    def start(self) -> None:
        if not self.dry_run:
            self._worker.start()

    def stop(self, drain_seconds: float = 5.0) -> None:
        """Demande l'arrêt et laisse un court délai pour vider la file."""
        self._stop.set()
        self._wakeup.set()
        if self._worker.is_alive():
            self._worker.join(timeout=drain_seconds)

    def enqueue_episode(self, payload: dict) -> None:
        if self.dry_run:
            log.info("[dry-run] épisode : %s", json.dumps(payload, ensure_ascii=False))
            return
        with self._lock:
            self._db.execute(
                "INSERT INTO pending_events (table_name, payload, created_at) VALUES (?, ?, ?)",
                ("vocal_episodes", json.dumps(payload), time.time()),
            )
            self._db.commit()
        self._wakeup.set()

    def send_heartbeat(self, payload: dict) -> None:
        if self.dry_run:
            log.debug("[dry-run] heartbeat : %s", json.dumps(payload))
            return
        try:
            resp = requests.post(
                f"{self.base_url}/agent_heartbeats",
                headers=self.headers,
                json=payload,
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            log.warning("heartbeat perdu (%s)", exc)

    def queue_size(self) -> int:
        with self._lock:
            (n,) = self._db.execute("SELECT COUNT(*) FROM pending_events").fetchone()
        return n

    # ---------------------------------------------------------------- worker

    def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set() or self.queue_size() > 0:
            batch = self._fetch_batch()
            if not batch:
                if self._stop.is_set():
                    return
                self._wakeup.wait(timeout=30)
                self._wakeup.clear()
                continue

            if self._send_batch(batch):
                backoff = 1.0
                continue

            log.warning(
                "envoi échoué, nouvel essai dans %.0fs (%d événements en attente)",
                backoff,
                self.queue_size(),
            )
            if self._stop.wait(timeout=backoff):
                return
            backoff = min(backoff * 2, MAX_BACKOFF)

    def _fetch_batch(self) -> list[tuple[int, str, str]]:
        with self._lock:
            return self._db.execute(
                "SELECT id, table_name, payload FROM pending_events ORDER BY id LIMIT ?",
                (BATCH_SIZE,),
            ).fetchall()

    def _send_batch(self, batch: list[tuple[int, str, str]]) -> bool:
        # Regroupe par table pour poster en une requête par table.
        by_table: dict[str, list[tuple[int, dict]]] = {}
        for row_id, table, payload in batch:
            by_table.setdefault(table, []).append((row_id, json.loads(payload)))

        for table, rows in by_table.items():
            try:
                resp = requests.post(
                    f"{self.base_url}/{table}",
                    headers=self.headers,
                    json=[payload for _, payload in rows],
                    timeout=REQUEST_TIMEOUT,
                )
                resp.raise_for_status()
            except requests.RequestException as exc:
                log.debug("POST %s : %s", table, exc)
                return False
            ids = [row_id for row_id, _ in rows]
            with self._lock:
                self._db.executemany(
                    "DELETE FROM pending_events WHERE id = ?", [(i,) for i in ids]
                )
                self._db.commit()
            log.info("%d événement(s) envoyé(s) vers %s", len(ids), table)
        return True
