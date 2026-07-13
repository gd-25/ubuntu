"""Détection des vocalises du chien à partir de fenêtres audio.

Deux responsabilités :
- YamnetClassifier : classe une fenêtre audio (16 kHz mono float32) avec YAMNet
  et renvoie la confiance "chien" + les scores par famille (bark/howl/whine).
- EpisodeTracker : machine à états avec hystérésis qui transforme la suite de
  fenêtres classées en épisodes {started_at, ended_at, kind, avg/peak confidence},
  avec filtrage des épisodes trop courts et fusion des épisodes rapprochés.

EpisodeTracker est du pur Python sans dépendance ML : c'est lui qui est couvert
par les tests unitaires (tests/test_detector.py).
"""

from __future__ import annotations

import csv
import logging
from collections import deque
from dataclasses import dataclass, field

log = logging.getLogger("ubuntu.detector")

# Durée d'une fenêtre YAMNet (~15600 échantillons à 16 kHz).
WINDOW_DURATION = 0.975
# Décalage entre deux fenêtres consécutives.
HOP_DURATION = 0.5

# Classes AudioSet cibles, regroupées en familles.
FAMILY_CLASSES = {
    "bark": ("Bark", "Bow-wow", "Yip"),
    "howl": ("Howl",),
    "whine": ("Whimper (dog)", "Growling"),
}
# "Dog" compte pour la détection (positif/négatif) mais ne vote pour aucune famille.
EXTRA_TARGET_CLASSES = ("Dog",)


@dataclass
class WindowResult:
    """Résultat de classification d'une fenêtre audio."""

    timestamp: float  # début de la fenêtre, epoch UTC (secondes)
    confidence: float  # score max sur l'ensemble des classes cibles
    family_scores: dict[str, float]  # score max par famille

    def is_positive(self, threshold: float) -> bool:
        return self.confidence >= threshold


@dataclass
class Episode:
    started_at: float  # epoch UTC
    ended_at: float  # epoch UTC
    kind: str  # 'bark' | 'howl' | 'whine'
    avg_confidence: float
    peak_confidence: float

    @property
    def duration(self) -> float:
        return self.ended_at - self.started_at


@dataclass
class _PendingEpisode:
    """Épisode en construction / en attente de fusion éventuelle."""

    started_at: float
    ended_at: float
    family_votes: dict[str, int] = field(default_factory=dict)
    family_score_sums: dict[str, float] = field(default_factory=dict)
    conf_sum: float = 0.0
    conf_count: int = 0
    peak: float = 0.0

    def add_window(self, w: WindowResult, window_duration: float) -> None:
        self.ended_at = max(self.ended_at, w.timestamp + window_duration)
        self.conf_sum += w.confidence
        self.conf_count += 1
        self.peak = max(self.peak, w.confidence)
        if not w.family_scores:
            return
        best = max(w.family_scores, key=lambda k: w.family_scores[k])
        if w.family_scores[best] <= 0:
            return
        self.family_votes[best] = self.family_votes.get(best, 0) + 1
        for fam, score in w.family_scores.items():
            self.family_score_sums[fam] = self.family_score_sums.get(fam, 0.0) + score

    def absorb(self, other: "_PendingEpisode") -> None:
        """Fusionne `other` (plus récent) dans cet épisode."""
        self.ended_at = max(self.ended_at, other.ended_at)
        self.conf_sum += other.conf_sum
        self.conf_count += other.conf_count
        self.peak = max(self.peak, other.peak)
        for fam, n in other.family_votes.items():
            self.family_votes[fam] = self.family_votes.get(fam, 0) + n
        for fam, s in other.family_score_sums.items():
            self.family_score_sums[fam] = self.family_score_sums.get(fam, 0.0) + s

    def to_episode(self) -> Episode:
        if self.family_votes:
            # Majorité des votes, départagée par la somme des scores.
            kind = max(
                self.family_votes,
                key=lambda f: (self.family_votes[f], self.family_score_sums.get(f, 0.0)),
            )
        else:
            kind = "bark"  # seule la classe générique "Dog" a réagi
        avg = self.conf_sum / self.conf_count if self.conf_count else 0.0
        return Episode(
            started_at=self.started_at,
            ended_at=self.ended_at,
            kind=kind,
            avg_confidence=round(avg, 4),
            peak_confidence=round(self.peak, 4),
        )


class EpisodeTracker:
    """Hystérésis fenêtre par fenêtre → épisodes.

    - Passage à l'état "vocalise" si >= `enter_votes` des `enter_window` dernières
      fenêtres sont positives (défaut : 3 sur 5).
    - Retour à "calme" après >= `exit_negatives` fenêtres négatives consécutives
      (défaut : 8, soit ~4 s avec un hop de 0,5 s).
    - Épisodes de durée < `min_duration` (1 s) : ignorés.
    - Deux épisodes séparés de < `merge_gap` (5 s) : fusionnés. Un épisode n'est
      donc émis qu'une fois le délai de fusion écoulé (voir poll()/flush()).
    """

    def __init__(
        self,
        threshold: float = 0.3,
        enter_votes: int = 3,
        enter_window: int = 5,
        exit_negatives: int = 8,
        min_duration: float = 1.0,
        merge_gap: float = 5.0,
        window_duration: float = WINDOW_DURATION,
    ):
        self.threshold = threshold
        self.enter_votes = enter_votes
        self.exit_negatives = exit_negatives
        self.min_duration = min_duration
        self.merge_gap = merge_gap
        self.window_duration = window_duration

        self._recent: deque[tuple[WindowResult, bool]] = deque(maxlen=enter_window)
        self._vocal = False
        self._current: _PendingEpisode | None = None
        self._negatives = 0
        self._pending: _PendingEpisode | None = None  # clos, en attente de fusion
        self._ready: list[Episode] = []

    @property
    def is_vocal(self) -> bool:
        return self._vocal

    def push(self, window: WindowResult) -> list[Episode]:
        """Ingère une fenêtre classée ; renvoie les épisodes prêts à émettre."""
        positive = window.is_positive(self.threshold)
        self._recent.append((window, positive))

        if self._vocal:
            self._push_vocal(window, positive)
        else:
            self._push_calm()

        self._release_pending(window.timestamp)
        ready, self._ready = self._ready, []
        return ready

    def _push_calm(self) -> None:
        positives = [w for w, pos in self._recent if pos]
        if len(positives) < self.enter_votes:
            return
        self._vocal = True
        self._negatives = 0
        first = positives[0]
        self._current = _PendingEpisode(
            started_at=first.timestamp, ended_at=first.timestamp
        )
        for w, pos in self._recent:
            if pos:
                self._current.add_window(w, self.window_duration)

    def _push_vocal(self, window: WindowResult, positive: bool) -> None:
        assert self._current is not None
        if positive:
            self._negatives = 0
            self._current.add_window(window, self.window_duration)
            return
        self._negatives += 1
        if self._negatives < self.exit_negatives:
            return
        self._close_current()

    def _close_current(self) -> None:
        candidate, self._current = self._current, None
        self._vocal = False
        self._negatives = 0
        self._recent.clear()
        assert candidate is not None

        if candidate.ended_at - candidate.started_at < self.min_duration:
            log.debug("épisode < %.1fs ignoré", self.min_duration)
            return

        if self._pending is not None:
            if candidate.started_at - self._pending.ended_at < self.merge_gap:
                self._pending.absorb(candidate)
                return
            self._ready.append(self._pending.to_episode())
        self._pending = candidate

    def _release_pending(self, now: float) -> None:
        if self._pending is None or self._vocal:
            return
        if now - self._pending.ended_at >= self.merge_gap:
            self._ready.append(self._pending.to_episode())
            self._pending = None

    def poll(self, now: float) -> list[Episode]:
        """À appeler périodiquement même sans audio (permet d'émettre un épisode
        en attente de fusion quand le délai est écoulé)."""
        self._release_pending(now)
        ready, self._ready = self._ready, []
        return ready

    def flush(self) -> list[Episode]:
        """Clôt et émet tout (arrêt de l'agent ou perte du flux)."""
        if self._current is not None:
            self._close_current()
        episodes = []
        if self._pending is not None:
            episodes.append(self._pending.to_episode())
            self._pending = None
        episodes = self._ready + episodes
        self._ready = []
        return episodes


class YamnetClassifier:
    """Enveloppe du modèle YAMNet TFLite.

    Chargement paresseux de tflite_runtime (ou tensorflow en secours) pour que
    detector.py reste importable sans dépendance ML (tests, --help, etc.).
    """

    def __init__(self, model_path: str, class_map_path: str):
        import numpy as np

        self._np = np
        self._interpreter = self._load_interpreter(model_path)
        self._class_indices = self._load_class_map(class_map_path)

        input_details = self._interpreter.get_input_details()[0]
        self._input_index = input_details["index"]
        n_samples = int(WINDOW_DURATION * 16000)  # 15600
        self._interpreter.resize_tensor_input(self._input_index, [n_samples])
        self._interpreter.allocate_tensors()
        self._scores_index = self._interpreter.get_output_details()[0]["index"]

    @staticmethod
    def _load_interpreter(model_path: str):
        try:
            from tflite_runtime.interpreter import Interpreter
        except ImportError:
            try:
                from tensorflow.lite import Interpreter  # type: ignore
            except ImportError as exc:
                raise RuntimeError(
                    "Ni tflite-runtime ni tensorflow ne sont installés. "
                    "pip install tflite-runtime (ou tensorflow)."
                ) from exc
        return Interpreter(model_path=model_path)

    @staticmethod
    def _load_class_map(class_map_path: str) -> dict[str, list[int]]:
        """Renvoie {'bark': [idx...], 'howl': [...], 'whine': [...], '_extra': [...]}."""
        name_to_index: dict[str, int] = {}
        with open(class_map_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                name_to_index[row["display_name"]] = int(row["index"])

        indices: dict[str, list[int]] = {}
        missing: list[str] = []
        for family, names in FAMILY_CLASSES.items():
            indices[family] = []
            for name in names:
                if name in name_to_index:
                    indices[family].append(name_to_index[name])
                else:
                    missing.append(name)
        indices["_extra"] = []
        for name in EXTRA_TARGET_CLASSES:
            if name in name_to_index:
                indices["_extra"].append(name_to_index[name])
            else:
                missing.append(name)
        if missing:
            raise RuntimeError(
                f"Classes absentes de {class_map_path}: {missing}. "
                "Vérifier que le fichier est bien yamnet_class_map.csv."
            )
        return indices

    def classify(self, waveform) -> tuple[float, dict[str, float]]:
        """waveform : np.ndarray float32 [-1, 1], 15600 échantillons à 16 kHz.

        Renvoie (confiance max sur les classes cibles, scores max par famille).
        """
        np = self._np
        self._interpreter.set_tensor(self._input_index, waveform.astype(np.float32))
        self._interpreter.invoke()
        scores = self._interpreter.get_tensor(self._scores_index)
        frame_max = scores.max(axis=0)  # max sur les frames internes du modèle

        family_scores = {
            family: float(frame_max[idx].max()) if idx else 0.0
            for family, idx in self._class_indices.items()
            if family != "_extra"
        }
        all_indices = [i for idx in self._class_indices.values() for i in idx]
        confidence = float(frame_max[all_indices].max())
        return confidence, family_scores
