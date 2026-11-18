"""
The two functions backend/main.py calls. Output shapes match ARCHITECTURE.md's
API contract exactly (predict returns an ordered list of behavior segments,
compare returns {control, treated, difference} frequency dicts), so swapping
the model underneath never needs a backend change.

Input is the canonical keypoints array from preprocess.parse_keypoints_json:
float (T, 2, 7, 2), mouse 0 = resident, mouse 1 = intruder.

Pipeline: resample to 30 Hz -> per-frame features -> HistGradientBoosting
probabilities -> moving-average smoothing -> argmax -> merge runs into
segments. All times are in seconds on the ORIGINAL recording's clock.
"""
from typing import Dict, List, Tuple

import numpy as np

try:
    from .features import compute_features
    from .model import load_model, smooth_probs
    from .preprocess import BEHAVIOR_LABELS, FRAME_RATE, resample_keypoints
except ImportError:  # flat-script layout
    from features import compute_features
    from model import load_model, smooth_probs
    from preprocess import BEHAVIOR_LABELS, FRAME_RATE, resample_keypoints

_bundle = None


def _get_model():
    global _bundle
    if _bundle is None:
        _bundle = load_model()
    return _bundle


def predict_frames(keypoints: np.ndarray, frame_rate: float = FRAME_RATE) -> Tuple[np.ndarray, np.ndarray]:
    """Per-frame (labels, smoothed probabilities) on the 30 Hz resampled clock."""
    clf, meta = _get_model()
    kp = resample_keypoints(np.asarray(keypoints, dtype=np.float32), frame_rate)
    probs = smooth_probs(clf.predict_proba(compute_features(kp)), meta["smoothing_window"])
    return probs.argmax(axis=1), probs


def predict_behaviors(keypoints: np.ndarray, frame_rate: float = FRAME_RATE) -> List[dict]:
    """Classify a recording into ordered {start_time, end_time, behavior_label,
    confidence} segments covering the whole recording. confidence is the mean
    smoothed probability of the chosen label over the segment."""
    labels, probs = predict_frames(keypoints, frame_rate)
    duration = len(keypoints) / frame_rate

    # Boundaries of runs of identical labels.
    change = np.flatnonzero(np.diff(labels)) + 1
    starts = np.concatenate([[0], change])
    ends = np.concatenate([change, [len(labels)]])

    segments: List[dict] = []
    for a, b in zip(starts, ends):
        label = int(labels[a])
        # Resampling to 30 Hz can drop a fraction of a frame at the tail, so
        # the last segment is pinned to the recording's true duration.
        end = duration if b == len(labels) else min(b / FRAME_RATE, duration)
        segments.append(
            {
                "start_time": round(float(min(a / FRAME_RATE, duration)), 2),
                "end_time": round(float(end), 2),
                "behavior_label": BEHAVIOR_LABELS[label],
                "confidence": round(float(probs[a:b, label].mean()), 2),
            }
        )
    return segments


def behavior_frequencies(keypoints: np.ndarray, frame_rate: float = FRAME_RATE) -> Dict[str, float]:
    """Fraction of the recording spent in each of the four behaviors."""
    labels, _ = predict_frames(keypoints, frame_rate)
    counts = np.bincount(labels, minlength=len(BEHAVIOR_LABELS))
    return {name: round(float(c) / len(labels), 2) for name, c in zip(BEHAVIOR_LABELS, counts)}


def compare_behaviors(
    control: np.ndarray,
    treated: np.ndarray,
    control_frame_rate: float = FRAME_RATE,
    treated_frame_rate: float = FRAME_RATE,
) -> dict:
    """Run the classifier on each recording separately and diff the behavior
    frequencies (treated minus control)."""
    control_freq = behavior_frequencies(control, control_frame_rate)
    treated_freq = behavior_frequencies(treated, treated_frame_rate)
    difference = {k: round(treated_freq[k] - control_freq[k], 2) for k in BEHAVIOR_LABELS}
    return {"control": control_freq, "treated": treated_freq, "difference": difference}
