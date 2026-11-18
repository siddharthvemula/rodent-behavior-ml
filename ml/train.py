"""
Trains the placeholder classifier on SYNTHETIC keypoint sequences, not
CalMS21/MABe22. This exists so the backend has a real (if not yet
real-data-trained) model to call instead of hardcoded mock numbers, while
the actual dataset download/preprocessing/training is still pending (see
ml/README.md "Status").

Replacing this with the real thing means: download_data.py pulls
CalMS21/MABe22, preprocess.py's parse step reads their actual label/keypoint
format into the same {frame_rate, frames} shape (or extend it), and this
file trains on that instead of simulate_sequence(). model.py's
save/load and inference.py's two functions don't need to change.

Run: `pip install -r requirements.txt && python train.py` from this
directory. Prints train/test accuracy on the synthetic data (NOT a
real-world metric, see caveat below) and writes model.joblib.
"""
import random
from typing import List

import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

from model import BEHAVIOR_LABELS, WINDOW_SECONDS, build_pipeline, save_model
from preprocess import Frame, extract_features

FRAME_RATE = 30.0
WINDOW_FRAMES = int(WINDOW_SECONDS * FRAME_RATE)


def simulate_sequence(label: str, n_frames: int, rng: random.Random) -> List[Frame]:
    """One synthetic window of keypoints with a label-specific motion
    signature. Signal is intentionally crude/separable, this is a stand-in
    for real pose data, not a model of real mouse behavior.
    """
    frames: List[Frame] = []
    cx, cy = 0.0, 0.0
    for t in range(n_frames):
        if label == "grooming":
            # small-radius, high-frequency jitter around the nose; body stays put
            cx += rng.gauss(0, 0.02)
            cy += rng.gauss(0, 0.02)
            nose = [cx + 0.15 * np.sin(t * 1.2), cy + 0.15 * np.cos(t * 1.3)]
        elif label == "investigation":
            # steady directed movement toward a fixed point
            cx += 0.08 + rng.gauss(0, 0.02)
            cy += 0.02 + rng.gauss(0, 0.01)
            nose = [cx + 0.3, cy + 0.05 * np.sin(t * 0.3)]
        else:  # rearing
            # vertical excursion up and back down over the window
            phase = t / max(n_frames - 1, 1)
            cy = 0.6 * np.sin(phase * np.pi)
            cx += rng.gauss(0, 0.01)
            nose = [cx, cy + 0.2]
        tail = [cx - 0.3, cy - 0.1 * np.sin(t * 0.2)]
        frames.append({"nose": nose, "center": [cx, cy], "tail_base": tail})
    return frames


def build_synthetic_dataset(n_per_class: int = 300, seed: int = 0):
    rng = random.Random(seed)
    X, y = [], []
    for label in BEHAVIOR_LABELS:
        for _ in range(n_per_class):
            window = simulate_sequence(label, WINDOW_FRAMES, rng)
            X.append(extract_features(window))
            y.append(label)
    return np.array(X), np.array(y)


def main() -> None:
    X, y = build_synthetic_dataset()
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=0, stratify=y
    )

    pipeline = build_pipeline()
    pipeline.fit(X_train, y_train)

    preds = pipeline.predict(X_test)
    print(f"Synthetic-data test accuracy: {accuracy_score(y_test, preds):.3f}")
    print(
        "NOTE: this accuracy is against synthetic data this script generated, "
        "it says nothing about real-world performance. Do not report it as a result."
    )
    print(classification_report(y_test, preds))

    save_model(pipeline)
    print(f"Saved model to {pipeline.__class__.__name__} -> model.joblib")


if __name__ == "__main__":
    main()
