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


def _frequencies_from_labels(labels: np.ndarray) -> Dict[str, float]:
    counts = np.bincount(labels, minlength=len(BEHAVIOR_LABELS))
    return {name: round(float(c) / len(labels), 2) for name, c in zip(BEHAVIOR_LABELS, counts)}


def behavior_frequencies(keypoints: np.ndarray, frame_rate: float = FRAME_RATE) -> Dict[str, float]:
    """Fraction of the recording spent in each of the four behaviors."""
    labels, _ = predict_frames(keypoints, frame_rate)
    return _frequencies_from_labels(labels)


def compare_behaviors(
    control: np.ndarray,
    treated: np.ndarray,
    control_frame_rate: float = FRAME_RATE,
    treated_frame_rate: float = FRAME_RATE,
) -> dict:
    """Run the classifier on each recording separately and diff the behavior
    frequencies (treated minus control)."""
    return compare_with_intervals(control, treated, control_frame_rate, treated_frame_rate)[0]


# ---- uncertainty (additive: the compare result itself is unchanged) ----

BOOTSTRAP_REPLICATES = 500
BOOTSTRAP_BLOCK_SECONDS = 10.0
INTERVAL_LEVEL = 0.95


def bootstrap_frequencies(labels: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Circular block bootstrap of one recording's per-frame labels.

    Neighbouring frames are almost always the same label (bouts last seconds),
    so resampling single frames would claim far more certainty than the clip
    supports. Resampling whole ~10 s blocks keeps that dependence. Returns
    (BOOTSTRAP_REPLICATES, n_behaviors) resampled label fractions.

    What this measures: how stable this one clip's behavior fractions are
    against which stretches happened to be sampled. It is NOT a test of
    whether two animals or groups differ.
    """
    n = len(labels)
    n_labels = len(BEHAVIOR_LABELS)
    block = int(max(1, min(round(BOOTSTRAP_BLOCK_SECONDS * FRAME_RATE), n // 4 or 1)))
    n_blocks = int(np.ceil(n / block))
    # prefix[i] = per-label frame counts in doubled[:i]; the doubling makes blocks wrap around.
    onehot = np.eye(n_labels, dtype=np.int64)[np.concatenate([labels, labels])]
    prefix = np.vstack([np.zeros((1, n_labels), dtype=np.int64), np.cumsum(onehot, axis=0)])
    starts = rng.integers(0, n, size=(BOOTSTRAP_REPLICATES, n_blocks))
    counts = (prefix[starts + block] - prefix[starts]).sum(axis=1)
    return counts / (n_blocks * block)


def _interval(samples: np.ndarray) -> List[float]:
    tail = (1 - INTERVAL_LEVEL) / 2 * 100
    lo, hi = np.percentile(samples, [tail, 100 - tail])
    return [round(float(lo), 3), round(float(hi), 3)]


def compare_with_intervals(
    control: np.ndarray,
    treated: np.ndarray,
    control_frame_rate: float = FRAME_RATE,
    treated_frame_rate: float = FRAME_RATE,
) -> Tuple[dict, dict]:
    """compare_behaviors' result plus 95% bootstrap intervals for each
    recording's frequencies and for their difference (treated minus control).
    Deterministic: the bootstrap uses a fixed seed."""
    control_labels, _ = predict_frames(control, control_frame_rate)
    treated_labels, _ = predict_frames(treated, treated_frame_rate)
    control_freq = _frequencies_from_labels(control_labels)
    treated_freq = _frequencies_from_labels(treated_labels)
    difference = {k: round(treated_freq[k] - control_freq[k], 2) for k in BEHAVIOR_LABELS}
    result = {"control": control_freq, "treated": treated_freq, "difference": difference}

    rng = np.random.default_rng(0)
    control_boot = bootstrap_frequencies(control_labels, rng)
    treated_boot = bootstrap_frequencies(treated_labels, rng)
    diff_boot = treated_boot - control_boot
    intervals = {
        "level": INTERVAL_LEVEL,
        "control": {k: _interval(control_boot[:, i]) for i, k in enumerate(BEHAVIOR_LABELS)},
        "treated": {k: _interval(treated_boot[:, i]) for i, k in enumerate(BEHAVIOR_LABELS)},
        "difference": {k: _interval(diff_boot[:, i]) for i, k in enumerate(BEHAVIOR_LABELS)},
    }
    return result, intervals
