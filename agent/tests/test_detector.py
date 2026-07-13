"""Tests unitaires du cœur métier : hystérésis, fusion, durées (EpisodeTracker).

Lancer :  cd agent && python3 -m pytest tests/ -v
Aucune dépendance ML requise (EpisodeTracker est du pur Python).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from detector import EpisodeTracker, WindowResult  # noqa: E402

HOP = 0.5
WINDOW = 0.975


def make_tracker(**overrides):
    params = dict(
        threshold=0.3,
        enter_votes=3,
        enter_window=5,
        exit_negatives=8,
        min_duration=1.0,
        merge_gap=5.0,
        window_duration=WINDOW,
    )
    params.update(overrides)
    return EpisodeTracker(**params)


def feed(tracker, pattern, start=1000.0, kind="bark", confidence=0.8):
    """Envoie une suite de fenêtres : '+' = positive, '-' = négative.

    Renvoie (épisodes émis, timestamp après la dernière fenêtre).
    """
    episodes = []
    t = start
    for ch in pattern:
        if ch == "+":
            scores = {"bark": 0.0, "howl": 0.0, "whine": 0.0}
            scores[kind] = confidence
            w = WindowResult(t, confidence, scores)
        else:
            w = WindowResult(t, 0.01, {"bark": 0.01, "howl": 0.0, "whine": 0.0})
        episodes.extend(tracker.push(w))
        t += HOP
    return episodes, t


def drain(tracker, t, seconds=30.0):
    """Fait avancer le temps (fenêtres négatives) pour libérer les épisodes en attente."""
    episodes = []
    end = t + seconds
    while t < end:
        eps, t = feed(tracker, "-", start=t)
        episodes.extend(eps)
    return episodes


def close_and_drain(tracker, pattern, start=1000.0, **feed_kwargs):
    episodes, t = feed(tracker, pattern, start=start, **feed_kwargs)
    episodes += drain(tracker, t)
    return episodes


# ------------------------------------------------------------------ hystérésis


def test_no_episode_below_enter_votes():
    """2 fenêtres positives sur 5 : pas assez pour entrer en état vocalise."""
    tracker = make_tracker()
    episodes = close_and_drain(tracker, "+-+-" + "-" * 10)
    assert episodes == []


def test_enters_vocal_state_with_3_of_5_positives():
    tracker = make_tracker()
    feed(tracker, "+-+-+")
    assert tracker.is_vocal


def test_episode_starts_at_first_positive_window():
    tracker = make_tracker()
    start = 1000.0
    episodes = close_and_drain(tracker, "+-+-+" + "-" * 8, start=start)
    assert len(episodes) == 1
    assert episodes[0].started_at == start


def test_stays_vocal_until_8_consecutive_negatives():
    tracker = make_tracker()
    # 7 négatives puis une positive : l'épisode continue.
    feed(tracker, "+++" + "-" * 7 + "+")
    assert tracker.is_vocal

    tracker2 = make_tracker()
    feed(tracker2, "+++" + "-" * 8)
    assert not tracker2.is_vocal


def test_episode_end_is_last_positive_plus_window_duration():
    tracker = make_tracker()
    start = 1000.0
    episodes = close_and_drain(tracker, "+++++" + "-" * 8, start=start)
    assert len(episodes) == 1
    last_positive_ts = start + 4 * HOP
    assert episodes[0].ended_at == last_positive_ts + WINDOW


def test_interleaved_negatives_do_not_split_episode():
    """Des négatives isolées (< 8 consécutives) ne coupent pas l'épisode."""
    tracker = make_tracker()
    episodes = close_and_drain(tracker, "+++--+--+++" + "-" * 8)
    assert len(episodes) == 1


# ------------------------------------------------------------------ durées


def test_episode_shorter_than_min_duration_is_dropped():
    # enter_votes=1 pour pouvoir produire un épisode d'une seule fenêtre courte.
    tracker = make_tracker(enter_votes=1, enter_window=1, window_duration=0.4, min_duration=1.0)
    episodes = close_and_drain(tracker, "+" + "-" * 8)
    assert episodes == []


def test_episode_longer_than_min_duration_is_kept():
    tracker = make_tracker(enter_votes=1, enter_window=1, window_duration=0.4, min_duration=1.0)
    episodes = close_and_drain(tracker, "+++" + "-" * 8)
    assert len(episodes) == 1
    assert episodes[0].duration >= 1.0


# ------------------------------------------------------------------ fusion


def test_two_close_episodes_are_merged():
    """Deux épisodes séparés de < 5 s ne font qu'un."""
    tracker = make_tracker()
    # Épisode 1, puis 8 négatives (clôture ~4s de gap), puis épisode 2 immédiat.
    episodes = close_and_drain(tracker, "+++++" + "-" * 8 + "+++++" + "-" * 8)
    assert len(episodes) == 1


def test_merged_episode_spans_both():
    tracker = make_tracker()
    start = 1000.0
    episodes = close_and_drain(tracker, "+++++" + "-" * 8 + "+++++" + "-" * 8, start=start)
    ep = episodes[0]
    assert ep.started_at == start
    last_positive_ts = start + 17 * HOP  # index 17 = dernière fenêtre positive
    assert ep.ended_at == last_positive_ts + WINDOW


def test_two_distant_episodes_stay_separate():
    """Deux épisodes séparés de > 5 s restent distincts."""
    tracker = make_tracker()
    # 20 négatives entre les deux = ~10 s de silence.
    episodes = close_and_drain(tracker, "+++++" + "-" * 20 + "+++++" + "-" * 8)
    assert len(episodes) == 2


def test_pending_episode_released_by_poll():
    """Un épisode clos est émis via poll() une fois le délai de fusion écoulé,
    même sans nouvelle fenêtre audio (flux coupé)."""
    tracker = make_tracker()
    episodes, t = feed(tracker, "+++++" + "-" * 8)
    assert episodes == []  # encore en attente de fusion
    assert tracker.poll(t + 1.0) == []  # trop tôt
    released = tracker.poll(t + 10.0)
    assert len(released) == 1


def test_flush_emits_open_episode():
    """flush() clôt et émet l'épisode en cours (arrêt de l'agent)."""
    tracker = make_tracker()
    episodes, _ = feed(tracker, "+++++")
    assert episodes == []
    flushed = tracker.flush()
    assert len(flushed) == 1
    assert flushed[0].kind == "bark"


# ------------------------------------------------------------------ familles & confiance


def test_kind_is_majority_family():
    tracker = make_tracker()
    episodes, t = feed(tracker, "+++", kind="howl")
    eps, t = feed(tracker, "+", start=t, kind="bark")
    episodes += eps
    eps, t = feed(tracker, "-" * 8, start=t)
    episodes += eps
    episodes += drain(tracker, t)
    assert len(episodes) == 1
    assert episodes[0].kind == "howl"  # 3 votes howl vs 1 vote bark


def test_confidence_stats():
    tracker = make_tracker()
    episodes, t = feed(tracker, "++", confidence=0.4)
    eps, t = feed(tracker, "+", start=t, confidence=0.9)
    episodes += eps
    eps, t = feed(tracker, "-" * 8, start=t)
    episodes += eps
    episodes += drain(tracker, t)
    ep = episodes[0]
    assert ep.peak_confidence == 0.9
    assert abs(ep.avg_confidence - (0.4 + 0.4 + 0.9) / 3) < 1e-3


def test_windows_below_threshold_are_negative():
    tracker = make_tracker(threshold=0.5)
    episodes = close_and_drain(tracker, "+++++", confidence=0.4)
    episodes += tracker.flush()
    assert episodes == []
