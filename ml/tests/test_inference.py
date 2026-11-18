"""Contract tests for inference.py against the committed ml/model.joblib.
These check the API shape the backend relies on, not model quality (that is
ml/metrics.json)."""
import numpy as np
import pytest

import inference as I
import preprocess as P
from test_features import _kp


def _check_segments(segs, duration):
    assert len(segs) >= 1
    assert segs[0]["start_time"] == 0.0
    assert segs[-1]["end_time"] == pytest.approx(duration, abs=0.02)
    for a, b in zip(segs, segs[1:]):
        assert a["end_time"] == b["start_time"]            # contiguous, no gaps/overlaps
        assert a["behavior_label"] != b["behavior_label"]  # adjacent same-label runs are merged
    for s in segs:
        assert set(s) == {"start_time", "end_time", "behavior_label", "confidence"}
        assert s["end_time"] > s["start_time"]
        # plain Python types at the API boundary, not numpy scalars
        assert type(s["start_time"]) is float and type(s["end_time"]) is float
        assert type(s["confidence"]) is float and type(s["behavior_label"]) is str
        assert s["behavior_label"] in P.BEHAVIOR_LABELS
        assert 0.0 <= s["confidence"] <= 1.0


def test_predict_behaviors_contract():
    kp = _kp(450)
    _check_segments(I.predict_behaviors(kp, 30.0), 450 / 30.0)


def test_predict_behaviors_other_frame_rates():
    for rate, n in ((25.0, 200), (60.0, 600), (15.0, 90)):
        _check_segments(I.predict_behaviors(_kp(n), rate), n / rate)


@pytest.mark.parametrize("n", [1, 2, 5])
def test_predict_very_short(n):
    _check_segments(I.predict_behaviors(_kp(n), 30.0), n / 30.0)


def test_compare_behaviors_contract():
    out = I.compare_behaviors(_kp(300, seed=1), _kp(300, seed=2))
    assert set(out) == {"control", "treated", "difference"}
    for k in ("control", "treated", "difference"):
        assert list(out[k]) == P.BEHAVIOR_LABELS
    for k in ("control", "treated"):
        assert sum(out[k].values()) == pytest.approx(1.0, abs=0.03)  # 2-decimal rounding
    for lab in P.BEHAVIOR_LABELS:
        assert out["difference"][lab] == pytest.approx(out["treated"][lab] - out["control"][lab], abs=0.011)


def test_compare_identical_recordings_has_zero_difference():
    kp = _kp(300)
    assert set(I.compare_behaviors(kp, kp)["difference"].values()) == {0.0}


def test_deterministic():
    kp = _kp(300)
    assert I.predict_behaviors(kp) == I.predict_behaviors(kp)


def test_old_placeholder_labels_are_gone():
    labels = {s["behavior_label"] for s in I.predict_behaviors(_kp(300))}
    assert not labels & {"grooming", "rearing"}
