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
        # Colonnes ajoutées après coup (files queue.db déjà en production).
        try:
            self._db.execute(
                "ALTER TABLE pending_events ADD COLUMN op TEXT NOT NULL DEFAULT 'insert'"
            )
            self._db.execute("ALTER TABLE pending_events ADD COLUMN row_id TEXT")
        except sqlite3.OperationalError:
            pass  # colonnes déjà présentes
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

    def enqueue_update(self, table: str, row_id: str, fields: dict) -> None:
        """PATCH différé d'une ligne (ex. clip_path une fois le clip uploadé)."""
        if self.dry_run:
            log.info("[dry-run] update %s/%s : %s", table, row_id, json.dumps(fields))
            return
        with self._lock:
            self._db.execute(
                "INSERT INTO pending_events (table_name, payload, created_at, op, row_id)"
                " VALUES (?, ?, ?, 'update', ?)",
                (table, json.dumps(fields), time.time(), row_id),
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

    def _fetch_batch(self) -> list[tuple[int, str, str, str, str | None]]:
        with self._lock:
            return self._db.execute(
                "SELECT id, table_name, payload, op, row_id FROM pending_events"
                " ORDER BY id LIMIT ?",
                (BATCH_SIZE,),
            ).fetchall()

    def _delete_rows(self, ids: list[int]) -> None:
        with self._lock:
            self._db.executemany(
                "DELETE FROM pending_events WHERE id = ?", [(i,) for i in ids]
            )
            self._db.commit()

    def _send_batch(self, batch: list[tuple[int, str, str, str, str | None]]) -> bool:
        # Regroupe les inserts par table (une requête par table) ; les updates
        # partent individuellement.
        inserts: dict[str, list[tuple[int, dict]]] = {}
        updates: list[tuple[int, str, str, dict]] = []
        for queue_id, table, payload, op, row_id in batch:
            if op == "update" and row_id:
                updates.append((queue_id, table, row_id, json.loads(payload)))
            else:
                inserts.setdefault(table, []).append((queue_id, json.loads(payload)))

        for table, rows in inserts.items():
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
            self._delete_rows([queue_id for queue_id, _ in rows])
            log.info("%d événement(s) envoyé(s) vers %s", len(rows), table)

        for queue_id, table, row_id, fields in updates:
            try:
                resp = requests.patch(
                    f"{self.base_url}/{table}?id=eq.{row_id}",
                    headers=self.headers,
                    json=fields,
                    timeout=REQUEST_TIMEOUT,
                )
                resp.raise_for_status()
            except requests.RequestException as exc:
                log.debug("PATCH %s/%s : %s", table, row_id, exc)
                return False
            self._delete_rows([queue_id])
            log.info("mise à jour envoyée : %s/%s", table, row_id)
        return True
