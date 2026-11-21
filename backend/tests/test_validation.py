"""Unit tests for backend/validation.py that don't need the HTTP layer."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest
from validation import MAX_FRAMES, UploadRejected, validate_recording


def _payload(n=120, frame_rate=30.0):
    rng = np.random.default_rng(0)
    frames = []
    for t in range(n):
        mice = []
        for m in range(2):
            cx, cy = 300 + 200 * m + t * 0.2, 300 + np.sin(t / 10) * 20
            mouse = {k: [cx + dx, cy + dy] for k, (dx, dy) in {
                "nose": (40, 0), "ear_left": (30, -8), "ear_right": (30, 8), "neck": (20, 0),
                "hip_left": (-20, -10), "hip_right": (-20, 10), "tail_base": (-60, 0)}.items()}
            mice.append(mouse)
        frames.append({"mice": mice})
    return {"frame_rate": frame_rate, "frames": frames}


def _v(d, label="file"):
    return validate_recording(json.dumps(d).encode(), label)


def test_valid_recording_roundtrips():
    rec = _v(_payload(150))
    assert rec.keypoints.shape == (150, 2, 7, 2) and rec.keypoints.dtype == np.float32
    assert rec.duration == 5.0 and np.isfinite(rec.keypoints).all()


def test_frame_cap_is_enforced_before_parsing_frames():
    d = {"frame_rate": 30.0, "frames": [0] * (MAX_FRAMES + 1)}     # frames are junk: cap must trigger first
    with pytest.raises(UploadRejected) as e:
        _v(d)
    assert e.value.status_code == 422 and "limit" in e.value.detail


def test_missing_frame_rate_assumes_30_with_warning():
    d = _payload(150)
    del d["frame_rate"]
    rec = _v(d)
    assert rec.frame_rate == 30.0 and any("assuming 30" in w for w in rec.warnings)


def test_interpolation_fills_values_linearly():
    d = _payload(150)
    truth = [d["frames"][t]["mice"][0]["nose"] for t in (9, 13)]
    for t in (10, 11, 12):
        d["frames"][t]["mice"][0]["nose"] = [None, None]
    rec = _v(d)
    filled = rec.keypoints[11, 0, 0]
    np.testing.assert_allclose(filled, np.mean(truth, axis=0), atol=1e-3)


def test_gap_at_edges_is_held_not_rejected():
    d = _payload(150)
    for t in range(3):
        d["frames"][t]["mice"][1]["hip_left"] = [None, None]
    assert np.isfinite(_v(d).keypoints).all()


def test_exactly_max_gap_ok_and_one_more_rejected():
    for n, ok in ((5, True), (6, False)):
        d = _payload(150)
        for t in range(20, 20 + n):
            d["frames"][t]["mice"][0]["tail_base"] = [None, None]
        if ok:
            _v(d)
        else:
            with pytest.raises(UploadRejected):
                _v(d)


def test_keypoint_missing_everywhere_rejected():
    d = _payload(150)
    for f in d["frames"]:
        f["mice"][0]["nose"] = [None, None]
    with pytest.raises(UploadRejected, match="every frame"):
        _v(d)


def test_infinity_and_overflowing_ints_rejected_with_location():
    for bad in ('1e999', str(10 ** 400)):
        raw = json.dumps(_payload(150)).replace('"nose": [340.0', f'"nose": [{bad}', 1).encode()
        with pytest.raises(UploadRejected, match="out of range"):
            validate_recording(raw, "file")


def test_zero_dropout_marker_warns():
    d = _payload(150)
    for f in d["frames"][:100]:                      # 3 of 14 keypoints at (0, 0) for most of the clip
        for name in ("nose", "neck", "ear_left"):
            f["mice"][0][name] = [0, 0]
    rec = _v(d)
    assert any("(0, 0)" in w for w in rec.warnings)


def test_not_json_and_binary_are_415():
    for raw in (b"\x00\x01\x02\xff", b"hello"):
        with pytest.raises(UploadRejected) as e:
            validate_recording(raw, "file")
        assert e.value.status_code == 415


def test_label_is_used_in_messages():
    with pytest.raises(UploadRejected) as e:
        validate_recording(b'{"frames": []}', "Recording B")
    assert "Recording B" in e.value.detail
