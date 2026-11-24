import pytest

import group_metrics as gm
from jellyfish_loader import Bout, Video

ALL = frozenset((a, t, b) for b, (a, t) in gm.BEHAVIORS.items())


def video(bouts, n_frames=1800, scored=ALL):
    return Video("v", "naive", "train", "1", 30.0, n_frames / 30, (1000, 1000 + n_frames), scored, bouts)


def bout(action, s, e):
    a, t = gm.BEHAVIORS[action]
    return Bout(a, t, action, 1000 + s, 1000 + e)


def test_locked_design_constants():
    assert list(gm.BEHAVIORS) == ["attack", "dominancegroom", "sniff", "sniffgenital", "dig", "selfgroom"]
    assert "allogroom" not in gm.BEHAVIORS and "escape" not in gm.BEHAVIORS
    assert len(gm.PRIMARY) == 12 and len(set(gm.PRIMARY)) == 12
    assert gm.GROUP_ORDER == ("naive", "stress", "isolation", "mated")


def test_time_and_rate_known_values():
    # 1800 frames = 60 s = 1 min; attack covers 90 frames in 2 bouts
    m = gm.video_metrics(video([bout("attack", 0, 30), bout("attack", 100, 160)]))
    assert m["attack_time_pct"] == pytest.approx(5.0) and m["attack_bouts_per_min"] == pytest.approx(2.0)
    assert m["sniff_time_pct"] == 0.0 and m["sniff_bouts_per_min"] == 0.0


def test_overlapping_and_touching_bouts_merge():
    assert gm.merged_intervals([Bout("a", "b", "x", 0, 10), Bout("a", "b", "x", 5, 20), Bout("a", "b", "x", 20, 30), Bout("a", "b", "x", 40, 50)]) == [(0, 30), (40, 50)]
    m = gm.video_metrics(video([bout("dig", 0, 30), bout("dig", 15, 45)]))
    assert m["dig_time_pct"] == pytest.approx(100 * 45 / 1800) and m["dig_bouts_per_min"] == pytest.approx(1.0)


def test_other_behaviors_and_the_intruders_sniffgenital_are_not_counted():
    intruder = Bout("mouse2", "mouse1", "sniffgenital", 1000, 1500)
    m = gm.video_metrics(video([intruder, bout("sniffgenital", 0, 18)]))
    assert m["sniffgenital_time_pct"] == pytest.approx(1.0)


def test_uniform_coverage_is_enforced():
    with pytest.raises(ValueError, match="coverage is not uniform"):
        gm.video_metrics(video([], scored=ALL - {("mouse1", "self", "dig")}))
