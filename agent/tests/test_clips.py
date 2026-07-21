"""Tests de la sélection de segments pour les clips vidéo."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from clips import pick_segments  # noqa: E402

SEG = 4.0  # durée d'un segment


def seg(name: str, end_time: float) -> tuple[Path, float]:
    return (Path(name), end_time)


def test_picks_segments_overlapping_range():
    segments = [seg("a", 100.0), seg("b", 104.0), seg("c", 108.0), seg("d", 112.0)]
    # Clip couvrant 101 → 106 : il faut b (96-104… enfin 100-104) et c (104-108).
    picked = pick_segments(segments, 101.0, 106.0, SEG)
    assert picked == [Path("b"), Path("c")]


def test_includes_preroll_segment():
    segments = [seg("a", 100.0), seg("b", 104.0), seg("c", 108.0)]
    # Le clip commence à 99.5 : le segment a (96-100) couvre le préroll.
    picked = pick_segments(segments, 99.5, 105.0, SEG)
    assert picked == [Path("a"), Path("b"), Path("c")]


def test_excludes_old_and_future_segments():
    segments = [seg("old", 80.0), seg("a", 100.0), seg("future", 130.0)]
    picked = pick_segments(segments, 97.0, 99.0, SEG)
    assert picked == [Path("a")]


def test_sorted_by_time_even_if_input_unordered():
    segments = [seg("c", 108.0), seg("a", 100.0), seg("b", 104.0)]
    picked = pick_segments(segments, 97.0, 107.0, SEG)
    assert picked == [Path("a"), Path("b"), Path("c")]


def test_empty_when_no_segments():
    assert pick_segments([], 0.0, 10.0, SEG) == []


# ------------------------------------------------- gating vidéo par session

import queue  # noqa: E402

from clips import ClipRecorder  # noqa: E402


def _recorder(should_record):
    """ClipRecorder sans ffmpeg ni réseau : on exerce le vrai worker (_run)."""
    rec = ClipRecorder.__new__(ClipRecorder)
    rec.should_record = should_record
    rec.made = []
    rec._make_clip = lambda eid, s, e: rec.made.append(eid)
    rec._cleanup = lambda: None
    rec._queue = queue.Queue()
    return rec


def _run_one(rec, episode_id):
    rec._queue.put((episode_id, 0.0, 1.0))
    rec._queue.put(None)  # termine le worker
    rec._run()


def test_clip_skipped_out_of_session():
    rec = _recorder(should_record=lambda: False)
    _run_one(rec, "ep1")
    assert rec.made == []


def test_clip_made_in_session():
    rec = _recorder(should_record=lambda: True)
    _run_one(rec, "ep2")
    assert rec.made == ["ep2"]


def test_clip_made_without_gating():
    rec = _recorder(should_record=None)
    _run_one(rec, "ep3")
    assert rec.made == ["ep3"]
