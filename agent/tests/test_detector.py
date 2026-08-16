"""Tests unitaires du cœur métier : hystérésis, fusion, durées, événements live.

Lancer :  cd agent && python3 -m pytest tests/ -v
Aucune dépendance ML requise (EpisodeTracker est du pur Python).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from detector import EpisodeTracker, NoiseTracker, WindowResult  # noqa: E402

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
        update_interval=2.0,
    )
    params.update(overrides)
    return EpisodeTracker(**params)


def feed(tracker, pattern, start=1000.0, kind="bark", confidence=0.8, rms=0.05):
    """Envoie une suite de fenêtres : '+' = positive, '-' = négative.

    Renvoie (événements émis, timestamp après la dernière fenêtre).
    """
    events = []
    t = start
    for ch in pattern:
        if ch == "+":
            scores = {"bark": 0.0, "howl": 0.0, "whine": 0.0}
            scores[kind] = confidence
            w = WindowResult(t, confidence, scores, dog_score=confidence, rms=rms)
        else:
            w = WindowResult(t, 0.01, {"bark": 0.01, "howl": 0.0, "whine": 0.0})
        events.extend(tracker.push(w))
        t += HOP
    return events, t


def final_episodes(events):
    """Rejoue le flux d'événements : état final des lignes en base."""
    rows = {}
    closed = set()
    for ev in events:
        if ev.action == "discard":
            rows.pop(ev.episode_id, None)
            closed.discard(ev.episode_id)
        else:
            rows[ev.episode_id] = ev.episode
            if ev.action == "close":
                closed.add(ev.episode_id)
    return [rows[i] for i in rows if i in closed]


def run(tracker, pattern, start=1000.0, **feed_kwargs):
    events, t = feed(tracker, pattern, start=start, **feed_kwargs)
    events += tracker.flush()
    return events


# ------------------------------------------------------------------ hystérésis


def test_no_episode_below_enter_votes():
    """2 fenêtres positives sur 5 : pas assez pour entrer en état vocalise."""
    tracker = make_tracker()
    events = run(tracker, "+-+-" + "-" * 10)
    assert events == []


def test_enters_vocal_state_with_3_of_5_positives():
    tracker = make_tracker()
    feed(tracker, "+-+-+")
    assert tracker.is_vocal


def test_open_event_fires_at_entry():
    """L'événement `open` part dès l'entrée en vocalise (~3 fenêtres), pas à la fin."""
    tracker = make_tracker()
    start = 1000.0
    events, _ = feed(tracker, "+-+-+", start=start)
    assert [e.action for e in events] == ["open"]
    assert events[0].episode.started_at == start


def test_episode_starts_at_first_positive_window():
    tracker = make_tracker()
    start = 1000.0
    episodes = final_episodes(run(tracker, "+-+-+" + "-" * 8, start=start))
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
    episodes = final_episodes(run(tracker, "+++++" + "-" * 8, start=start))
    assert len(episodes) == 1
    last_positive_ts = start + 4 * HOP
    assert episodes[0].ended_at == last_positive_ts + WINDOW


def test_interleaved_negatives_do_not_split_episode():
    """Des négatives isolées (< 8 consécutives) ne coupent pas l'épisode."""
    tracker = make_tracker()
    episodes = final_episodes(run(tracker, "+++--+--+++" + "-" * 8))
    assert len(episodes) == 1


# ------------------------------------------------------------------ live


def test_close_event_fires_at_hysteresis_exit():
    """Le `close` part dès les 8 négatives — plus d'attente du délai de fusion."""
    tracker = make_tracker()
    events, _ = feed(tracker, "+++++" + "-" * 8)
    assert events[-1].action == "close"


def test_update_events_are_throttled():
    """Pendant une vocalise longue, des `update` partent toutes les ~2 s."""
    tracker = make_tracker(update_interval=2.0)
    events, _ = feed(tracker, "+" * 13)  # 6,5 s de positives
    actions = [e.action for e in events]
    assert actions[0] == "open"
    assert actions.count("update") == 3  # t+2s, t+4s, t+6s
    # Chaque update étend bien la fin de l'épisode.
    ends = [e.episode.ended_at for e in events]
    assert ends == sorted(ends)


def test_update_carries_provisional_kind():
    tracker = make_tracker()
    events, _ = feed(tracker, "+" * 6, kind="howl")
    assert all(e.episode.kind == "howl" for e in events)


# ------------------------------------------------------------------ durées


def test_episode_shorter_than_min_duration_is_discarded():
    # enter_votes=1 pour pouvoir produire un épisode d'une seule fenêtre courte.
    tracker = make_tracker(
        enter_votes=1, enter_window=1, window_duration=0.4, min_duration=1.0
    )
    events = run(tracker, "+" + "-" * 8)
    assert [e.action for e in events] == ["open", "discard"]
    assert events[0].episode_id == events[1].episode_id
    assert final_episodes(events) == []


def test_episode_longer_than_min_duration_is_kept():
    tracker = make_tracker(
        enter_votes=1, enter_window=1, window_duration=0.4, min_duration=1.0
    )
    episodes = final_episodes(run(tracker, "+++" + "-" * 8))
    assert len(episodes) == 1
    assert episodes[0].duration >= 1.0


# ------------------------------------------------------------------ fusion


def test_two_close_episodes_merge_into_same_row():
    """Deux épisodes séparés de < 5 s : la même ligne est rouverte puis étendue."""
    tracker = make_tracker()
    events = run(tracker, "+++++" + "-" * 8 + "+++++" + "-" * 8)
    opens = [e for e in events if e.action == "open"]
    assert len(opens) == 1  # une seule ligne créée
    episodes = final_episodes(events)
    assert len(episodes) == 1


def test_merged_episode_spans_both():
    tracker = make_tracker()
    start = 1000.0
    episodes = final_episodes(
        run(tracker, "+++++" + "-" * 8 + "+++++" + "-" * 8, start=start)
    )
    ep = episodes[0]
    assert ep.started_at == start
    last_positive_ts = start + 17 * HOP  # index 17 = dernière fenêtre positive
    assert ep.ended_at == last_positive_ts + WINDOW


def test_two_distant_episodes_stay_separate():
    """Deux épisodes séparés de > 5 s restent des lignes distinctes."""
    tracker = make_tracker()
    # 20 négatives entre les deux = ~10 s de silence.
    events = run(tracker, "+++++" + "-" * 20 + "+++++" + "-" * 8)
    opens = {e.episode_id for e in events if e.action == "open"}
    assert len(opens) == 2
    assert len(final_episodes(events)) == 2


def test_poll_expires_merge_window():
    """Après merge_gap sans reprise, une nouvelle vocalise = nouvelle ligne."""
    tracker = make_tracker()
    events, t = feed(tracker, "+++++" + "-" * 8)
    assert events[-1].action == "close"
    assert tracker.poll(t + 10.0) == []  # rien à émettre : la ligne est à jour
    more, _ = feed(tracker, "+++++", start=t + 10.0)
    assert more[0].action == "open"
    assert more[0].episode_id != events[-1].episode_id


def test_flush_closes_open_episode():
    """flush() clôt et émet l'épisode en cours (arrêt de l'agent)."""
    tracker = make_tracker()
    events, _ = feed(tracker, "+++++")
    assert events[0].action == "open"
    flushed = tracker.flush()
    assert flushed[-1].action == "close"
    assert flushed[-1].episode.kind == "bark"


# ------------------------------------------------------------------ veto rotation caméra


def test_birdlike_window_is_vetoed():
    """Le grincement du moteur (Bird/Squeak fort, chien faible) ne compte pas."""
    w = WindowResult(0.0, 0.9, {}, dog_score=0.05, veto_score=0.95)
    assert w.vetoed
    assert not w.is_positive(0.3)


def test_strong_dog_survives_bird_score():
    """Un vrai aboiement avec un oiseau audible reste positif."""
    w = WindowResult(0.0, 0.9, {}, dog_score=0.6, veto_score=0.9)
    assert not w.vetoed
    assert w.is_positive(0.3)


def test_soft_whine_with_moderate_bird_survives():
    """Couinement doux (dog 0.26, bird 0.50) : sous le plancher du veto."""
    w = WindowResult(0.0, 0.5, {}, dog_score=0.26, veto_score=0.50)
    assert not w.vetoed


def test_vetoed_windows_produce_no_episode():
    tracker = make_tracker()
    events = []
    t = 1000.0
    for _ in range(10):
        events += tracker.push(
            WindowResult(t, 0.9, {"bark": 0.9}, dog_score=0.05, veto_score=0.95)
        )
        t += HOP
    events += tracker.flush()
    assert events == []


# ------------------------------------------------------------------ familles, confiance, volume


def test_kind_is_majority_family():
    tracker = make_tracker()
    events, t = feed(tracker, "+++", kind="howl")
    evs, t = feed(tracker, "+", start=t, kind="bark")
    events += evs
    evs, t = feed(tracker, "-" * 8, start=t)
    events += evs
    episodes = final_episodes(events + tracker.flush())
    assert len(episodes) == 1
    assert episodes[0].kind == "howl"  # 3 votes howl vs 1 vote bark


def test_confidence_stats():
    tracker = make_tracker()
    events, t = feed(tracker, "++", confidence=0.4)
    evs, t = feed(tracker, "+", start=t, confidence=0.9)
    events += evs
    evs, t = feed(tracker, "-" * 8, start=t)
    events += evs
    ep = final_episodes(events + tracker.flush())[0]
    assert ep.peak_confidence == 0.9
    assert abs(ep.avg_confidence - (0.4 + 0.4 + 0.9) / 3) < 1e-3


def test_peak_rms_is_tracked():
    """Le volume max produit pendant l'épisode est conservé."""
    tracker = make_tracker()
    events, t = feed(tracker, "++", rms=0.02)
    evs, t = feed(tracker, "+", start=t, rms=0.11)
    events += evs
    evs, t = feed(tracker, "-" * 8, start=t, rms=0.30)  # le calme ne compte pas
    events += evs
    ep = final_episodes(events + tracker.flush())[0]
    assert ep.peak_rms == 0.11


def test_windows_below_threshold_are_negative():
    tracker = make_tracker(threshold=0.5)
    events = run(tracker, "+++++", confidence=0.4)
    assert events == []


# --------------------------------------------------------------- NoiseTracker


def noise_window(t, rms, dog_score=0.0, top_label="Speech"):
    return WindowResult(
        t,
        confidence=0.0,
        family_scores={},
        dog_score=dog_score,
        rms=rms,
        top_label=top_label,
    )


def feed_noise(tracker, rms_values, start=2000.0, covered=False):
    """Envoie une suite de fenêtres (une valeur de RMS chacune)."""
    closed = []
    t = start
    for rms in rms_values:
        closed += tracker.push(noise_window(t, rms), covered=covered)
        t += HOP
    return closed, t


def test_noise_opens_and_closes_on_volume():
    tracker = NoiseTracker(rms_threshold=0.01, exit_negatives=3, min_duration=0.4)
    closed, t = feed_noise(tracker, [0.02, 0.05, 0.02])
    assert closed == []  # toujours en cours
    closed, t = feed_noise(tracker, [0.001, 0.001], start=t)
    assert closed == []  # pas encore assez de fenêtres silencieuses
    closed, _ = feed_noise(tracker, [0.001], start=t)
    assert len(closed) == 1
    assert closed[0].peak_rms == 0.05
    assert closed[0].duration > 0.4


def test_short_noise_is_dropped():
    """Un pic isolé plus court que min_duration ne produit rien."""
    tracker = NoiseTracker(rms_threshold=0.01, exit_negatives=1, min_duration=2.0)
    closed, _ = feed_noise(tracker, [0.02, 0.001])
    assert closed == []


def test_covered_noise_is_flagged_before_it_closes():
    """Le bruit d'un épisode détecté est marqué même si l'épisode dure encore."""
    tracker = NoiseTracker(rms_threshold=0.01, exit_negatives=2, min_duration=0.4)
    closed, t = feed_noise(tracker, [0.05, 0.05], covered=True)
    assert closed == []
    closed, _ = feed_noise(tracker, [0.001, 0.001], start=t, covered=True)
    assert len(closed) == 1 and closed[0].covered is True


def test_long_noise_is_chunked():
    """Un bruit continu est tronçonné : jamais de clip d'une heure."""
    tracker = NoiseTracker(rms_threshold=0.01, exit_negatives=3, max_duration=3.0)
    closed, _ = feed_noise(tracker, [0.02] * 12)
    assert len(closed) >= 2
    assert all(n.duration <= 4.0 for n in closed)


def test_flush_closes_the_current_noise():
    tracker = NoiseTracker(rms_threshold=0.01, min_duration=0.4)
    feed_noise(tracker, [0.02, 0.02])
    assert len(tracker.flush()) == 1
    assert tracker.flush() == []
