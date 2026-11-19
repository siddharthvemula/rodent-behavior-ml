"""Smoke tests for the backend skeleton. Keep these passing, CI runs them on every PR."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
from fastapi.testclient import TestClient
from main import app, jobs
from ml_model.preprocess import BEHAVIOR_LABELS, to_json_dict

client = TestClient(app)


def _keypoints_json(n_frames: int = 300, frame_rate: float = 30.0, seed: int = 0, mutate=None) -> bytes:
    """A validly-shaped two-mouse keypoints upload (ARCHITECTURE.md "Data
    schema"): two random-walking mice with 7 keypoints each. Not real
    behavior, so tests assert the contract, never a specific label."""
    rng = np.random.default_rng(seed)
    centre = np.cumsum(rng.normal(0, 3, (n_frames, 2, 2)), axis=0) + np.array([[300.0, 300.0], [500.0, 280.0]])
    offsets = rng.normal(0, 25, (2, 7, 2))
    offsets[:, 0], offsets[:, 6] = [40, 0], [-60, 0]
    kp = (centre[:, :, None, :] + offsets[None] + rng.normal(0, 1, (n_frames, 2, 7, 2))).astype(np.float32)
    payload = to_json_dict(kp, frame_rate)
    if mutate:
        mutate(payload)
    return json.dumps(payload).encode()


def _post_predict(content: bytes, name: str = "clip.json"):
    return client.post("/api/predict", files={"file": (name, content, "application/json")})


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "model_loaded": True}


def test_predict_shape():
    resp = _post_predict(_keypoints_json(120))
    assert resp.status_code == 200
    body = resp.json()
    assert "job_id" in body
    assert body["status"] == "done"
    assert isinstance(body["result"], list)
    assert {"start_time", "end_time", "behavior_label", "confidence"} <= body["result"][0].keys()
    assert all(seg["behavior_label"] in BEHAVIOR_LABELS for seg in body["result"])


def test_compare_shape():
    resp = client.post(
        "/api/compare",
        files={
            "control": ("c.json", _keypoints_json(120, seed=1), "application/json"),
            "treated": ("t.json", _keypoints_json(120, seed=2), "application/json"),
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["result"].keys()) == {"control", "treated", "difference"}


def test_job_not_found():
    resp = client.get("/api/jobs/does-not-exist")
    assert resp.status_code == 404


def test_predict_rejects_empty_file():
    resp = client.post(
        "/api/predict",
        files={"file": ("test.mp4", b"", "video/mp4")},
    )
    assert resp.status_code == 400


def test_predict_rejects_oversized_file():
    from main import MAX_UPLOAD_BYTES

    oversized = b"0" * (MAX_UPLOAD_BYTES + 1)
    resp = client.post(
        "/api/predict",
        files={"file": ("big.mp4", oversized, "video/mp4")},
    )
    assert resp.status_code == 413


def test_compare_rejects_empty_file():
    resp = client.post(
        "/api/compare",
        files={
            "control": ("c.mp4", b"", "video/mp4"),
            "treated": ("t.mp4", b"fake-bytes", "video/mp4"),
        },
    )
    assert resp.status_code == 400


def test_predict_rejects_video_with_415_and_no_fake_result():
    before = len(jobs)
    resp = client.post("/api/predict", files={"file": ("clip.mp4", b"\x00\x00\x00\x18ftypmp42" + b"x" * 500, "video/mp4")})
    assert resp.status_code == 415
    detail = resp.json()["detail"]
    assert "keypoints" in detail and "video" in detail
    assert "result" not in resp.json()
    assert len(jobs) == before                                # no job created


def test_compare_rejects_video_with_415_naming_the_field():
    before = len(jobs)
    resp = client.post(
        "/api/compare",
        files={
            "control": ("c.json", _keypoints_json(120), "application/json"),
            "treated": ("t.mp4", b"fake-video-bytes", "video/mp4"),
        },
    )
    assert resp.status_code == 415
    assert "treated" in resp.json()["detail"]
    assert len(jobs) == before


def test_predict_real_model_for_keypoints_file():
    n, rate = 450, 30.0
    resp = _post_predict(_keypoints_json(n, rate))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "done"
    segs = body["result"]
    assert segs[0]["start_time"] == 0.0
    assert segs[-1]["end_time"] == n / rate                    # covers the whole recording
    for a, b in zip(segs, segs[1:]):
        assert a["end_time"] == b["start_time"]
    for seg in segs:
        assert seg["behavior_label"] in BEHAVIOR_LABELS
        assert 0.0 <= seg["confidence"] <= 1.0


def test_predict_honours_other_frame_rates():
    resp = _post_predict(_keypoints_json(250, frame_rate=25.0))
    assert resp.status_code == 200
    assert resp.json()["result"][-1]["end_time"] == 10.0       # 250 frames at 25 fps


def test_predict_job_is_pollable():
    job_id = _post_predict(_keypoints_json(120)).json()["job_id"]
    polled = client.get(f"/api/jobs/{job_id}")
    assert polled.status_code == 200 and polled.json()["status"] == "done"


def test_predict_rejects_old_single_animal_schema_with_422():
    old = {"frame_rate": 30.0, "frames": [{"nose": [0, 0], "center": [0, 0], "tail_base": [0, 0]}]}
    before = len(jobs)
    resp = _post_predict(json.dumps(old).encode())
    assert resp.status_code == 422                            # never a fabricated result
    assert "mice" in resp.json()["detail"]
    assert len(jobs) == before                                # no junk job left behind


def test_predict_rejects_malformed_keypoints_with_422():
    def drop_keypoint(d):
        del d["frames"][3]["mice"][1]["tail_base"]

    resp = _post_predict(_keypoints_json(120, mutate=drop_keypoint))
    assert resp.status_code == 422
    assert "frame 3" in resp.json()["detail"]


def test_predict_rejects_out_of_range_frame_rate():
    for rate in (0.001, 0, -5, 1e9):
        resp = _post_predict(_keypoints_json(120, mutate=lambda d, r=rate: d.update(frame_rate=r)))
        assert resp.status_code == 422, rate


def test_predict_json_without_frames_is_not_keypoints_415():
    for body in (b'{"hello": "world"}', b"[1, 2, 3]", b"not json at all"):
        assert _post_predict(body).status_code == 415, body


def test_compare_real_model_for_keypoints_files():
    resp = client.post(
        "/api/compare",
        files={
            "control": ("c.json", _keypoints_json(300, seed=1), "application/json"),
            "treated": ("t.json", _keypoints_json(450, seed=2), "application/json"),
        },
    )
    assert resp.status_code == 200
    result = resp.json()["result"]
    assert set(result) == {"control", "treated", "difference"}
    for block in result.values():
        assert list(block) == BEHAVIOR_LABELS
    for k in BEHAVIOR_LABELS:
        assert abs(result["difference"][k] - (result["treated"][k] - result["control"][k])) < 0.011


def test_compare_rejects_malformed_keypoints_with_422():
    resp = client.post(
        "/api/compare",
        files={
            "control": ("c.json", _keypoints_json(120), "application/json"),
            "treated": ("t.json", json.dumps({"frames": [{"nose": [0, 0]}]}).encode(), "application/json"),
        },
    )
    assert resp.status_code == 422
    assert "treated" in resp.json()["detail"]


# ---------------------------------------------------------------- hardening (HARDENING_PLAN.md)

def _set(path, value):
    """mutate(): payload['frames'][t]['mice'][m][name] = value, path = (t, m, name)."""
    t, m, name = path
    return lambda d: d["frames"][t]["mice"][m].__setitem__(name, value)


def _compare(a: bytes, b: bytes):
    return client.post(
        "/api/compare",
        files={"control": ("a.json", a, "application/json"), "treated": ("b.json", b, "application/json")},
    )


def test_predict_returns_empty_warnings_for_clean_file():
    body = _post_predict(_keypoints_json(300)).json()
    assert body["warnings"] == []
    assert body["durations"] is None


def test_rejects_recordings_under_three_seconds():
    for frames in (1, 5, 80):                                   # 80 frames = 2.7 s
        resp = _post_predict(_keypoints_json(frames))
        assert resp.status_code == 422, frames
        assert "at least 3 s" in resp.json()["detail"]


def test_short_but_allowed_recording_warns():
    resp = _post_predict(_keypoints_json(150))                  # 5 s
    assert resp.status_code == 200
    assert any("Short recording" in w for w in resp.json()["warnings"])


def test_malformed_tiny_file_reports_schema_problem_not_length():
    old = {"frame_rate": 30.0, "frames": [{"nose": [0, 0]}]}
    assert "mice" in _post_predict(json.dumps(old).encode()).json()["detail"]


def test_rejects_low_frame_rate():
    assert _post_predict(_keypoints_json(120, mutate=lambda d: d.update(frame_rate=5))).status_code == 422


def test_rejects_non_numeric_frame_rate_and_coordinates():
    for rate in (True, "30", None):
        assert _post_predict(_keypoints_json(120, mutate=lambda d, r=rate: d.update(frame_rate=r))).status_code == 422, rate
    for bad in (["1", "2"], [True, False], [1, 2, 3], {"x": 1, "y": 2}):
        resp = _post_predict(_keypoints_json(120, mutate=_set((2, 0, "nose"), bad)))
        assert resp.status_code == 422, bad
        assert "frame 2" in resp.json()["detail"]


def test_rejects_huge_coordinates_with_location_instead_of_500():
    resp = _post_predict(_keypoints_json(120, mutate=_set((4, 1, "tail_base"), [3e38, 1])))
    assert resp.status_code == 422
    assert "frame 4" in resp.json()["detail"] and "tail_base" in resp.json()["detail"]


def test_short_gaps_are_repaired_and_reported():
    def punch(d):
        for t in (10, 11, 12):
            d["frames"][t]["mice"][0]["nose"] = [None, None]
        d["frames"][50]["mice"][1]["neck"] = [float("nan"), 5.0]

    resp = _post_predict(_keypoints_json(150, mutate=punch))
    assert resp.status_code == 200
    assert any("filled by interpolation" in w for w in resp.json()["warnings"])


def test_long_gap_is_rejected_with_location():
    def punch(d):
        for t in range(20, 40):
            d["frames"][t]["mice"][1]["ear_left"] = [None, None]

    resp = _post_predict(_keypoints_json(150, mutate=punch))
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert "ear_left" in detail and "20 frames" in detail and "20-39" in detail


def test_constant_and_all_zero_recordings_are_rejected():
    def flatten(d):
        for f in d["frames"]:
            for mouse in f["mice"]:
                for name in mouse:
                    mouse[name] = [0.0, 0.0]

    resp = _post_predict(_keypoints_json(150, mutate=flatten))
    assert resp.status_code == 422 and "no movement" in resp.json()["detail"]


def test_wrong_scale_is_rejected_or_warned():
    def shrink(d, k):
        for f in d["frames"]:
            for mouse in f["mice"]:
                for name, (x, y) in mouse.items():
                    mouse[name] = [x * k, y * k]

    assert _post_predict(_keypoints_json(150, mutate=lambda d: shrink(d, 0.1))).status_code == 422   # ~10 px mice
    resp = _post_predict(_keypoints_json(150, mutate=lambda d: shrink(d, 0.8)))                      # ~80 px mice
    assert resp.status_code == 200
    assert any("CalMS21" in w for w in resp.json()["warnings"])


def test_csv_and_raw_calms21_get_tailored_415():
    csv = b"frame,x,y\n1,2,3\n2,3,4\n"
    resp = _post_predict(csv)
    assert resp.status_code == 415 and "CSV" in resp.json()["detail"]
    calms = json.dumps({"annotator-id_0": {"mouse001": {"keypoints": [[[[1]]]], "annotations": [0]}}}).encode()
    resp = _post_predict(calms)
    assert resp.status_code == 415 and "export_clip.py" in resp.json()["detail"]


def test_oversized_raw_calms21_gets_hint_with_413():
    from main import MAX_UPLOAD_BYTES

    big = b'{\n "annotator-id_0": {' + b" " * MAX_UPLOAD_BYTES
    resp = _post_predict(big)
    assert resp.status_code == 413 and "export_clip.py" in resp.json()["detail"]


def test_compare_errors_use_recording_a_b_names():
    bad = json.dumps({"frames": [{"nose": [0, 0]}]}).encode()
    resp = _compare(_keypoints_json(120), bad)
    assert resp.status_code == 422
    assert "Recording B (treated)" in resp.json()["detail"]
    resp = _compare(bad, _keypoints_json(120))
    assert "Recording A (control)" in resp.json()["detail"]


def test_compare_reports_durations_and_prefixed_warnings():
    resp = _compare(_keypoints_json(150, seed=1), _keypoints_json(900, seed=2))      # 5 s vs 30 s
    assert resp.status_code == 200
    body = resp.json()
    assert body["durations"] == {"control": 5.0, "treated": 30.0}
    assert any(w.startswith("Recording A: Short recording") for w in body["warnings"])
    assert not any(w.startswith("Recording B") for w in body["warnings"])


def test_compare_different_lengths_and_frame_rates_still_works():
    resp = _compare(_keypoints_json(120, seed=1), _keypoints_json(3000, frame_rate=60.0, seed=2))
    assert resp.status_code == 200
    assert resp.json()["durations"]["treated"] == 50.0


def test_inference_failure_returns_json_500_and_marks_job_failed(monkeypatch):
    import main

    def boom(*_a, **_k):
        raise ValueError("non-finite values in features")

    monkeypatch.setattr(main, "predict_behaviors", boom)
    before = set(jobs)
    resp = _post_predict(_keypoints_json(120))
    assert resp.status_code == 500
    assert "classifier failed" in resp.json()["detail"]
    (new_id,) = set(jobs) - before
    assert jobs[new_id]["status"] == "failed"                 # not stuck as "queued"
    assert client.get(f"/api/jobs/{new_id}").json()["status"] == "failed"


def test_job_store_is_bounded(monkeypatch):
    import main

    monkeypatch.setattr(main, "MAX_JOBS", 3)
    for _ in range(6):
        main._new_job()
    assert len(jobs) <= 3


def test_health_reports_503_when_model_cannot_load(monkeypatch):
    import main

    def broken():
        raise RuntimeError("scikit-learn mismatch")

    monkeypatch.setattr(main, "_get_model", broken)
    resp = client.get("/api/health")
    assert resp.status_code == 503
    assert resp.json()["model_loaded"] is False


def test_compare_reports_bootstrap_intervals_and_predict_does_not():
    body = _compare(_keypoints_json(450, seed=1), _keypoints_json(450, seed=2)).json()
    iv = body["intervals"]
    assert iv["level"] == 0.95
    for group in ("control", "treated", "difference"):
        assert list(iv[group]) == BEHAVIOR_LABELS
        assert all(len(pair) == 2 and pair[0] <= pair[1] for pair in iv[group].values())
    # the existing result shape is untouched
    assert set(body["result"]) == {"control", "treated", "difference"}

    predicted = client.post("/api/predict", files={"file": ("a.json", _keypoints_json(300), "application/json")})
    assert predicted.json()["intervals"] is None
