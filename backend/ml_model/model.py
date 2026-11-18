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
