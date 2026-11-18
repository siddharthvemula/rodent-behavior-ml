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
    assert resp.json() == {"status": "ok"}


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
            "control": ("c.json", _keypoints_json(60), "application/json"),
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

    resp = _post_predict(_keypoints_json(10, mutate=drop_keypoint))
    assert resp.status_code == 422
    assert "frame 3" in resp.json()["detail"]


def test_predict_rejects_out_of_range_frame_rate():
    for rate in (0.001, 0, -5, 1e9):
        resp = _post_predict(_keypoints_json(10, mutate=lambda d, r=rate: d.update(frame_rate=r)))
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
            "control": ("c.json", _keypoints_json(60), "application/json"),
            "treated": ("t.json", json.dumps({"frames": [{"nose": [0, 0]}]}).encode(), "application/json"),
        },
    )
    assert resp.status_code == 422
    assert "treated" in resp.json()["detail"]
