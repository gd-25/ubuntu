"""Détection des vocalises du chien à partir de fenêtres audio.

Deux responsabilités :
- YamnetClassifier : classe une fenêtre audio (16 kHz mono float32) avec YAMNet
  et renvoie la confiance "chien", les scores par famille (bark/howl/whine),
  la preuve spécifiquement chien et le score des classes « imitateurs »
  (oiseau/grincement — le moteur de rotation de la caméra).
- EpisodeTracker : machine à états avec hystérésis qui transforme la suite de
  fenêtres classées en épisodes LIVE : un événement `open` dès l'entrée en
  vocalise (~2-3 s), des `update` réguliers tant que ça dure, un `close` à la
  sortie, un `discard` si l'épisode était trop court. Une reprise < merge_gap
  rouvre le même épisode (même id → même ligne en base).

EpisodeTracker est du pur Python sans dépendance ML : c'est lui qui est couvert
par les tests unitaires (tests/test_detector.py).
"""

from __future__ import annotations

import csv
import logging
import uuid
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
# Classes comptant pour la détection (positif/négatif) sans voter pour une
# famille. Les classes génériques "Animal"/"Domestic animals, pets" sont là
# parce que les vocalises dégradées (micro 8 kHz, distance) font hésiter
# YAMNet entre chiot/chat/oiseau — mais "chien seul à la maison" implique que
# tout son animal est le chien.
EXTRA_TARGET_CLASSES = ("Dog", "Animal", "Domestic animals, pets")

# Classes portant une vraie preuve « chien » (pas les génériques Animal/…).
DOG_EVIDENCE_CLASSES = (
    "Bark", "Bow-wow", "Yip", "Howl", "Whimper (dog)", "Growling", "Dog",
)
# Le moteur de rotation de la caméra grince comme un oiseau : YAMNet le classe
# Bird/Chirp/Squeak avec un score très élevé, et la classe générique "Animal"
# suit — d'où des faux positifs. Une fenêtre est mise au veto quand ces
# classes dominent nettement toute preuve chien (calibré sur les clips
# écartés dans l'app + vérité terrain par mouvement vidéo, 2026-08-14 :
# 11/15 clips rotation supprimés, 0 vrai épisode perdu).
VETO_CLASSES = (
    "Bird",
    "Bird vocalization, bird call, bird song",
    "Chirp, tweet",
    "Squeak",
    "Wild animals",
)
VETO_RATIO = 2.0
VETO_FLOOR = 0.5

# Seuil « il s'est passé quelque chose » pour la capture des AUTRES BRUITS
# (tout ce que YAMNet n'a pas retenu comme vocalise). Volontairement bas :
# les couinements faibles qu'on rate aujourd'hui sont à peine au-dessus du
# bruit de fond de l'appartement. Calibré en live le 2026-08-16 : à 0.0015
# le fond de pièce (~0.0016) déclenchait tout seul.
NOISE_RMS = 0.002


@dataclass
class WindowResult:
    """Résultat de classification d'une fenêtre audio."""

    timestamp: float  # début de la fenêtre, epoch UTC (secondes)
    confidence: float  # score max sur l'ensemble des classes cibles
    family_scores: dict[str, float]  # score max par famille
    dog_score: float = 0.0  # score max des classes spécifiquement chien
    veto_score: float = 0.0  # score max des classes oiseau/grincement
    rms: float = 0.0  # volume RMS de la fenêtre [0..1]
    top_label: str = ""  # meilleure classe YAMNet, toutes classes confondues

    @property
    def vetoed(self) -> bool:
        """Bruit d'oiseau/grincement dominant toute preuve chien (rotation caméra)."""
        return self.veto_score > max(VETO_RATIO * self.dog_score, VETO_FLOOR)

    def is_positive(self, threshold: float) -> bool:
        return self.confidence >= threshold and not self.vetoed


@dataclass
class Episode:
    started_at: float  # epoch UTC
    ended_at: float  # epoch UTC
    kind: str  # 'bark' | 'howl' | 'whine'
    avg_confidence: float
    peak_confidence: float
    peak_rms: float = 0.0  # volume max produit pendant l'épisode

    @property
    def duration(self) -> float:
        return self.ended_at - self.started_at


@dataclass
class EpisodeEvent:
    """Événement live à répercuter en base.

    - open    : l'épisode démarre → INSERT (ended_at provisoire)
    - update  : il continue → PATCH (extension, éventuellement après fusion)
    - close   : il est clos → PATCH final (peut être suivi d'un update/close
                si une reprise < merge_gap le rouvre : même id, même ligne)
    - discard : trop court → DELETE
    """

    action: str  # 'open' | 'update' | 'close' | 'discard'
    episode_id: str
    episode: Episode | None = None


@dataclass
class _PendingEpisode:
    """Épisode en construction (ou clos mais encore fusionnable)."""

    episode_id: str
    started_at: float
    ended_at: float
    family_votes: dict[str, int] = field(default_factory=dict)
    family_score_sums: dict[str, float] = field(default_factory=dict)
    conf_sum: float = 0.0
    conf_count: int = 0
    peak: float = 0.0
    peak_rms: float = 0.0
    last_emit: float = 0.0  # timestamp du dernier événement émis (throttle)

    def add_window(self, w: WindowResult, window_duration: float) -> None:
        self.ended_at = max(self.ended_at, w.timestamp + window_duration)
        self.conf_sum += w.confidence
        self.conf_count += 1
        self.peak = max(self.peak, w.confidence)
        self.peak_rms = max(self.peak_rms, w.rms)
        if not w.family_scores:
            return
        best = max(w.family_scores, key=lambda k: w.family_scores[k])
        if w.family_scores[best] <= 0:
            return
        self.family_votes[best] = self.family_votes.get(best, 0) + 1
        for fam, score in w.family_scores.items():
            self.family_score_sums[fam] = self.family_score_sums.get(fam, 0.0) + score

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
            peak_rms=round(self.peak_rms, 5),
        )


class EpisodeTracker:
    """Hystérésis fenêtre par fenêtre → événements d'épisodes live.

    - Passage à l'état "vocalise" si >= `enter_votes` des `enter_window` dernières
      fenêtres sont positives (défaut : 3 sur 5) → événement `open` immédiat.
    - Tant que ça dure : `update` au plus toutes les `update_interval` secondes.
    - Retour à "calme" après >= `exit_negatives` fenêtres négatives consécutives
      (défaut : 8, soit ~4 s avec un hop de 0,5 s) → événement `close`.
    - Épisodes de durée < `min_duration` (1 s) : `discard`.
    - Une reprise < `merge_gap` (5 s) après un `close` ROUVRE le même épisode
      (même id) : la ligne en base est simplement étendue, jamais dupliquée.
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
        update_interval: float = 2.0,
    ):
        self.threshold = threshold
        self.enter_votes = enter_votes
        self.exit_negatives = exit_negatives
        self.min_duration = min_duration
        self.merge_gap = merge_gap
        self.window_duration = window_duration
        self.update_interval = update_interval

        self._recent: deque[tuple[WindowResult, bool]] = deque(maxlen=enter_window)
        self._vocal = False
        self._current: _PendingEpisode | None = None
        self._negatives = 0
        self._pending: _PendingEpisode | None = None  # clos, encore fusionnable

    @property
    def is_vocal(self) -> bool:
        return self._vocal

    def push(self, window: WindowResult) -> list[EpisodeEvent]:
        """Ingère une fenêtre classée ; renvoie les événements à répercuter."""
        events: list[EpisodeEvent] = []
        positive = window.is_positive(self.threshold)
        self._recent.append((window, positive))

        if self._vocal:
            self._push_vocal(window, positive, events)
        else:
            self._push_calm(events)

        self._expire_pending(window.timestamp)
        return events

    def _push_calm(self, events: list[EpisodeEvent]) -> None:
        positives = [w for w, pos in self._recent if pos]
        if len(positives) < self.enter_votes:
            return
        self._vocal = True
        self._negatives = 0
        first = positives[0]

        if (
            self._pending is not None
            and first.timestamp - self._pending.ended_at < self.merge_gap
        ):
            # Reprise rapide : on rouvre l'épisode précédent (même ligne).
            self._current, self._pending = self._pending, None
            for w, pos in self._recent:
                if pos:
                    self._current.add_window(w, self.window_duration)
            self._current.last_emit = first.timestamp
            events.append(
                EpisodeEvent("update", self._current.episode_id, self._current.to_episode())
            )
            return

        self._pending = None
        self._current = _PendingEpisode(
            episode_id=str(uuid.uuid4()),
            started_at=first.timestamp,
            ended_at=first.timestamp,
        )
        for w, pos in self._recent:
            if pos:
                self._current.add_window(w, self.window_duration)
        self._current.last_emit = first.timestamp
        events.append(
            EpisodeEvent("open", self._current.episode_id, self._current.to_episode())
        )

    def _push_vocal(
        self, window: WindowResult, positive: bool, events: list[EpisodeEvent]
    ) -> None:
        assert self._current is not None
        if positive:
            self._negatives = 0
            self._current.add_window(window, self.window_duration)
            if window.timestamp - self._current.last_emit >= self.update_interval:
                self._current.last_emit = window.timestamp
                events.append(
                    EpisodeEvent(
                        "update", self._current.episode_id, self._current.to_episode()
                    )
                )
            return
        self._negatives += 1
        if self._negatives < self.exit_negatives:
            return
        self._close_current(events)

    def _close_current(self, events: list[EpisodeEvent]) -> None:
        candidate, self._current = self._current, None
        self._vocal = False
        self._negatives = 0
        self._recent.clear()
        assert candidate is not None

        if candidate.ended_at - candidate.started_at < self.min_duration:
            log.debug("épisode < %.1fs écarté", self.min_duration)
            events.append(EpisodeEvent("discard", candidate.episode_id))
            return

        events.append(
            EpisodeEvent("close", candidate.episode_id, candidate.to_episode())
        )
        self._pending = candidate  # encore fusionnable pendant merge_gap

    def _expire_pending(self, now: float) -> None:
        if self._pending is None or self._vocal:
            return
        if now - self._pending.ended_at >= self.merge_gap:
            self._pending = None  # la ligne est déjà à jour en base

    def poll(self, now: float) -> list[EpisodeEvent]:
        """À appeler périodiquement même sans audio (expire la fenêtre de fusion)."""
        self._expire_pending(now)
        return []

    def flush(self) -> list[EpisodeEvent]:
        """Clôt et émet tout (arrêt de l'agent ou perte du flux)."""
        events: list[EpisodeEvent] = []
        if self._current is not None:
            self._close_current(events)
        self._pending = None
        return events


@dataclass
class Noise:
    """Un bruit entendu pendant une session, détecté ou non comme vocalise."""

    noise_id: str
    started_at: float
    ended_at: float
    peak_rms: float = 0.0
    top_label: str = ""
    dog_score: float = 0.0
    # True si un épisode de vocalise couvrait ce bruit : il est déjà
    # affiché dans la chronologie, inutile d'en refaire un « autre bruit ».
    covered: bool = False

    @property
    def duration(self) -> float:
        return self.ended_at - self.started_at


class NoiseTracker:
    """Découpe le flux en « bruits » sur le seul critère du volume.

    Indépendant de YAMNet et de son seuil : dès que le RMS dépasse
    `rms_threshold`, un bruit s'ouvre ; il se ferme après `exit_negatives`
    fenêtres sous le seuil. Les bruits couverts par un épisode détecté sont
    marqués (`mark_covered`) et jetés par l'appelant — ne restent que les
    « autres bruits », candidats à une promotion manuelle en couinement.
    """

    def __init__(
        self,
        rms_threshold: float = NOISE_RMS,
        # ~5 s de calme pour clore : deux bruits proches donnent UN clip
        # plutôt que dix (mesuré en live : 4 clips/min avec 3 s).
        exit_negatives: int = 10,
        # Un couinement dure au moins une seconde ; en dessous c'est un
        # claquement, un pas, un artefact de fenêtre.
        min_duration: float = 1.0,
        max_duration: float = 45.0,
        window_duration: float = WINDOW_DURATION,
    ):
        self.rms_threshold = rms_threshold
        self.exit_negatives = exit_negatives
        self.min_duration = min_duration
        self.max_duration = max_duration
        self.window_duration = window_duration
        self._current: Noise | None = None
        self._negatives = 0

    def push(self, window: WindowResult, covered: bool = False) -> list[Noise]:
        """Ingère une fenêtre ; renvoie les bruits qui viennent de se clore.

        `covered` : cette fenêtre appartient à un épisode de vocalise déjà
        détecté. Le marquage a lieu AVANT la fermeture éventuelle — un bruit
        se clôt plus tôt que l'épisode qui le contient (moins de fenêtres
        négatives pour sortir), il serait sinon relâché comme « autre bruit ».
        """
        closed: list[Noise] = []
        if covered and self._current is not None:
            self._current.covered = True
        if window.rms >= self.rms_threshold:
            self._negatives = 0
            if self._current is None:
                self._current = Noise(
                    noise_id=str(uuid.uuid4()),
                    started_at=window.timestamp,
                    ended_at=window.timestamp + self.window_duration,
                )
            noise = self._current
            noise.ended_at = max(noise.ended_at, window.timestamp + self.window_duration)
            noise.peak_rms = max(noise.peak_rms, window.rms)
            noise.dog_score = max(noise.dog_score, window.dog_score)
            if window.top_label and window.rms >= noise.peak_rms:
                noise.top_label = window.top_label
            # Un bruit continu (aspirateur, travaux) ne doit pas produire un
            # clip d'une heure : on le tronçonne.
            if noise.duration >= self.max_duration:
                closed.extend(self._close())
            return closed

        self._negatives += 1
        if self._current is not None and self._negatives >= self.exit_negatives:
            closed.extend(self._close())
        return closed

    def _close(self) -> list[Noise]:
        noise, self._current = self._current, None
        self._negatives = 0
        if noise is None or noise.duration < self.min_duration:
            return []
        return [noise]

    def flush(self) -> list[Noise]:
        return self._close()


class YamnetClassifier:
    """Enveloppe du modèle YAMNet TFLite.

    Chargement paresseux de tflite_runtime (ou tensorflow en secours) pour que
    detector.py reste importable sans dépendance ML (tests, --help, etc.).
    """

    def __init__(self, model_path: str, class_map_path: str):
        import numpy as np

        self._np = np
        self._interpreter = self._load_interpreter(model_path)
        self._class_indices, self._class_names = self._load_class_map(class_map_path)

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
                import tensorflow as tf

                Interpreter = tf.lite.Interpreter  # module lazy : pas de from-import
            except ImportError as exc:
                raise RuntimeError(
                    "Ni tflite-runtime ni tensorflow ne sont installés. "
                    "pip install tflite-runtime (ou tensorflow)."
                ) from exc
        return Interpreter(model_path=model_path)

    @staticmethod
    def _load_class_map(class_map_path: str) -> tuple[dict[str, list[int]], list[str]]:
        """Renvoie ({famille|_extra|_dog|_veto: [indices]}, noms par index)."""
        name_to_index: dict[str, int] = {}
        with open(class_map_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                name_to_index[row["display_name"]] = int(row["index"])
        # `names_by_index` et pas `names` : la boucle plus bas réutilise ce
        # nom pour les classes d'un groupe (on renverrait VETO_CLASSES…).
        names_by_index = [""] * (max(name_to_index.values(), default=-1) + 1)
        for name, index in name_to_index.items():
            names_by_index[index] = name

        groups: dict[str, tuple[str, ...]] = {
            **FAMILY_CLASSES,
            "_extra": EXTRA_TARGET_CLASSES,
            "_dog": DOG_EVIDENCE_CLASSES,
            "_veto": VETO_CLASSES,
        }
        indices: dict[str, list[int]] = {}
        missing: list[str] = []
        for group, names in groups.items():
            indices[group] = []
            for name in names:
                if name in name_to_index:
                    indices[group].append(name_to_index[name])
                else:
                    missing.append(name)
        if missing:
            raise RuntimeError(
                f"Classes absentes de {class_map_path}: {missing}. "
                "Vérifier que le fichier est bien yamnet_class_map.csv."
            )
        return indices, names_by_index

    def classify(self, waveform) -> tuple[float, dict[str, float], float, float, str]:
        """waveform : np.ndarray float32 [-1, 1], 15600 échantillons à 16 kHz.

        Renvoie (confiance max sur les classes cibles, scores max par famille,
        preuve chien spécifique, score des classes oiseau/grincement, nom de
        la classe la mieux notée toutes classes confondues).
        """
        np = self._np
        self._interpreter.set_tensor(self._input_index, waveform.astype(np.float32))
        self._interpreter.invoke()
        scores = self._interpreter.get_tensor(self._scores_index)
        frame_max = scores.max(axis=0)  # max sur les frames internes du modèle

        family_scores = {
            family: float(frame_max[idx].max()) if idx else 0.0
            for family, idx in self._class_indices.items()
            if family in FAMILY_CLASSES
        }
        target_indices = [
            i
            for group in (*FAMILY_CLASSES, "_extra")
            for i in self._class_indices[group]
        ]
        confidence = float(frame_max[target_indices].max())
        dog_score = float(frame_max[self._class_indices["_dog"]].max())
        veto_score = float(frame_max[self._class_indices["_veto"]].max())
        top_index = int(frame_max.argmax())
        top_label = (
            self._class_names[top_index] if top_index < len(self._class_names) else ""
        )
        return confidence, family_scores, dog_score, veto_score, top_label
