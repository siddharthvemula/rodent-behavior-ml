"""
Keypoints I/O and feature extraction, shared by inference.py (used by the
backend) and train.py (used to fit the model).

Keypoints contract (documented in ARCHITECTURE.md): a recording is JSON of
the shape:

    {
      "frame_rate": 30.0,
      "frames": [
        {"nose": [x, y], "center": [x, y], "tail_base": [x, y]},
        ...
      ]
    }

One dict per frame, three named 2D keypoints per frame. This is intentionally
minimal (single animal, 3 points) to keep day-one scope small. If the real
CalMS21/MABe22 preprocessing needs more keypoints or a second animal's
points, extend KEYPOINT_NAMES and the feature functions below, keep the
top-level {frame_rate, frames} shape so inference.py's callers don't change.
"""
import json
from typing import Dict, List

import numpy as np

KEYPOINT_NAMES = ["nose", "center", "tail_base"]

Frame = Dict[str, List[float]]


class KeypointsFormatError(ValueError):
    """Raised when uploaded bytes don't parse as the keypoints JSON contract."""


def parse_keypoints_json(raw: bytes) -> tuple[List[Frame], float]:
    """Parse uploaded bytes as the keypoints JSON contract.

    Raises KeypointsFormatError (never a bare JSONDecodeError/KeyError) so
    callers can cleanly fall back to something else, e.g. a raw video file
    that isn't keypoints at all. This is the one place that should know what
    "looks like a valid keypoints file" means.
    """
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise KeypointsFormatError("not valid JSON") from exc

    if not isinstance(data, dict) or "frames" not in data:
        raise KeypointsFormatError("missing 'frames'")

    frames = data["frames"]
    frame_rate = float(data.get("frame_rate", 30.0))
    if not isinstance(frames, list) or len(frames) == 0:
        raise KeypointsFormatError("'frames' must be a non-empty list")

    for frame in frames:
        if not isinstance(frame, dict) or any(name not in frame for name in KEYPOINT_NAMES):
            raise KeypointsFormatError(f"each frame needs keys {KEYPOINT_NAMES}")

    return frames, frame_rate


def extract_features(window: List[Frame]) -> np.ndarray:
    """Hand-crafted features for one fixed-length window of frames.

    Deliberately simple (velocity, jitter, vertical excursion of a few
    keypoints) so a small model can train fast on day one. A real model
    trained on CalMS21/MABe22 pose sequences would likely feed the raw
    per-frame keypoints into a GRU/LSTM instead of hand-crafted features;
    this is the placeholder, see ml/README.md.
    """
    centers = np.array([f["center"] for f in window], dtype=float)
    noses = np.array([f["nose"] for f in window], dtype=float)
    tails = np.array([f["tail_base"] for f in window], dtype=float)

    center_vel = np.diff(centers, axis=0)
    center_speed = np.linalg.norm(center_vel, axis=1) if len(center_vel) else np.array([0.0])

    nose_rel = noses - centers
    nose_jitter = np.linalg.norm(np.diff(nose_rel, axis=0), axis=1) if len(nose_rel) > 1 else np.array([0.0])

    vertical = centers[:, 1]
    vertical_range = float(vertical.max() - vertical.min()) if len(vertical) else 0.0

    body_length = np.linalg.norm(noses - tails, axis=1)

    return np.array(
        [
            float(center_speed.mean()),
            float(center_speed.std()),
            float(nose_jitter.mean()),
            float(nose_jitter.std()),
            vertical_range,
            float(body_length.mean()),
            float(body_length.std()),
        ]
    )
