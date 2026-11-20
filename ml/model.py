"""
The scikit-learn baseline classifier and its (de)serialization.

Frame-level classifier (HistGradientBoosting) over the per-frame features in
features.py, plus a small probability-smoothing step applied at inference.

The artifact is one joblib file holding {"classifier", "meta"}. It is
pickled by scikit-learn, so it must be loaded by the SAME scikit-learn
version that trained it: backend/requirements.txt pins scikit-learn, and
ml/requirements.txt must match. load_model() refuses a mismatch instead of
risking a silently wrong model.
"""
from pathlib import Path
from typing import Any, Dict, Tuple

import joblib
import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingClassifier

try:
    from .features import FEATURE_NAMES
    from .preprocess import BEHAVIOR_LABELS
except ImportError:  # flat-script layout
    from features import FEATURE_NAMES
    from preprocess import BEHAVIOR_LABELS

MODEL_PATH = Path(__file__).resolve().parent / "model.joblib"

# Smoothing window (frames at 30 Hz) applied to class probabilities at
# inference; chosen on train-only cross-validation, see train.py / metrics.json.
SMOOTHING_WINDOW = 31  # ~1 s; 61 ties on macro-F1 but hurts `investigation` (train-only CV)

DEFAULT_PARAMS: Dict[str, Any] = dict(
    max_iter=200,
    learning_rate=0.1,
    max_leaf_nodes=31,
    class_weight="balanced",  # `other` is ~60% of frames; macro-F1 is the target
    early_stopping=False,     # internal early stopping splits by frame -> leaks; we tune on recordings instead
    random_state=0,
)


def build_classifier(**overrides: Any) -> HistGradientBoostingClassifier:
    return HistGradientBoostingClassifier(**{**DEFAULT_PARAMS, **overrides})


def smooth_probs(probs: np.ndarray, window: int) -> np.ndarray:
    """Centered moving average of (T, n_classes) probabilities over `window`
    frames (edge-replicated). window <= 1 is a no-op. Frame-level predictions
    flicker; behaviors last many frames, so averaging removes one-frame blips
    without needing a separate sequence model."""
    if window <= 1 or len(probs) == 0:
        return probs
    left = window // 2
    padded = np.pad(probs, ((left, window - 1 - left), (0, 0)), mode="edge")
    csum = np.concatenate([np.zeros((1, probs.shape[1])), np.cumsum(padded, axis=0)])
    return (csum[window:window + len(probs)] - csum[:len(probs)]) / window


def smooth_probs_per_class(probs: np.ndarray, windows: Tuple[int, ...]) -> np.ndarray:
    """Like smooth_probs but each class column gets its own window (e.g. a long
    one for `other`, a short one for the brief `investigation` bouts)."""
    return np.stack([smooth_probs(probs[:, [k]], w)[:, 0] for k, w in enumerate(windows)], axis=1)


def viterbi_decode(probs: np.ndarray, switch_penalty: float, eps: float = 1e-4) -> np.ndarray:
    """Most likely label sequence under sum(log p_t[c_t]) - switch_penalty * (#class changes).

    A one-parameter alternative to moving-average smoothing: it removes
    flicker (a switch must "pay" `switch_penalty` nats of evidence) but, unlike
    a fixed window, does not blur the edges of short bouts. penalty 0 is plain
    argmax. Pure numpy, O(T * n_classes^2)."""
    t, k = probs.shape
    if t == 0:
        return np.zeros(0, dtype=np.int64)
    if switch_penalty <= 0:
        return probs.argmax(1)
    logp = np.log(np.clip(probs, eps, 1.0)).tolist()
    score = list(logp[0])
    back = [None] * t
    rng_k = range(k)
    for i in range(1, t):
        # best and second-best previous state: a switch INTO c comes from the
        # best state other than c (pay the penalty), staying in c is free.
        a1 = max(rng_k, key=score.__getitem__)
        m1 = score[a1]
        a2 = max((j for j in rng_k if j != a1), key=score.__getitem__)
        m2 = score[a2]
        row, new = [0] * k, [0.0] * k
        li = logp[i]
        for c in rng_k:
            j, other = (a2, m2) if c == a1 else (a1, m1)
            other -= switch_penalty
            if score[c] >= other:
                row[c], new[c] = c, score[c] + li[c]
            else:
                row[c], new[c] = j, other + li[c]
        back[i], score = row, new
    path = np.empty(t, dtype=np.int64)
    cur = max(rng_k, key=score.__getitem__)
    path[-1] = cur
    for i in range(t - 1, 0, -1):
        cur = back[i][cur]
        path[i - 1] = cur
    return path


def min_bout_filter(labels: np.ndarray, probs: np.ndarray, min_len: int) -> np.ndarray:
    """Merge predicted runs shorter than `min_len` frames into a neighbouring
    run (the adjacent class with the higher mean probability over the short
    run), shortest first, until none are left."""
    out = labels.copy()
    if min_len <= 1 or len(out) == 0:
        return out
    while True:
        bounds = np.flatnonzero(np.diff(out)) + 1
        starts, ends = np.r_[0, bounds], np.r_[bounds, len(out)]
        lens = ends - starts
        if len(lens) == 1 or lens.min() >= min_len:
            return out
        j = int(lens.argmin())
        s0, e0 = starts[j], ends[j]
        cands = ([out[s0 - 1]] if j > 0 else []) + ([out[e0]] if j < len(lens) - 1 else [])
        m = probs[s0:e0].mean(0)
        out[s0:e0] = max(cands, key=lambda c: m[c])


def save_model(clf: HistGradientBoostingClassifier, meta: Dict[str, Any], path: Path = MODEL_PATH) -> None:
    meta = {
        **meta,
        "sklearn_version": sklearn.__version__,
        "behavior_labels": list(BEHAVIOR_LABELS),
        "n_features": len(FEATURE_NAMES),
        "smoothing_window": SMOOTHING_WINDOW,
    }
    joblib.dump({"classifier": clf, "meta": meta}, path, compress=3)


def load_model(path: Path = MODEL_PATH) -> Tuple[HistGradientBoostingClassifier, Dict[str, Any]]:
    bundle = joblib.load(path)
    clf, meta = bundle["classifier"], bundle["meta"]
    if meta["sklearn_version"] != sklearn.__version__:
        raise RuntimeError(
            f"{path.name} was trained with scikit-learn {meta['sklearn_version']} but "
            f"{sklearn.__version__} is installed; retrain or pin the matching version."
        )
    if meta["behavior_labels"] != list(BEHAVIOR_LABELS) or meta["n_features"] != len(FEATURE_NAMES):
        raise RuntimeError(f"{path.name} doesn't match the current labels/features; retrain.")
    if list(clf.classes_) != list(range(len(BEHAVIOR_LABELS))):
        raise RuntimeError(f"{path.name}: unexpected classes_ {clf.classes_}")
    return clf, meta
