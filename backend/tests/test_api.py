"""Smoke tests for the backend skeleton. Keep these passing, CI runs them on every PR."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_predict_shape():
    resp = client.post(
        "/api/predict",
        files={"file": ("test.mp4", b"fake-bytes", "video/mp4")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "job_id" in body
    assert body["status"] == "done"
    assert isinstance(body["result"], list)
    assert {"start_time", "end_time", "behavior_label", "confidence"} <= body["result"][0].keys()


def test_compare_shape():
    resp = client.post(
        "/api/compare",
        files={
            "control": ("c.mp4", b"fake-bytes", "video/mp4"),
            "treated": ("t.mp4", b"fake-bytes", "video/mp4"),
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
