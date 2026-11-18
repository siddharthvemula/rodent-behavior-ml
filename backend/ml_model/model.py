"""
Model definition + load/save. A scikit-learn pipeline, not the GRU/LSTM
ARCHITECTURE.md originally called for, see ml/README.md "Status" for why:
no GPU/torch and no network access to the real datasets in the environment
this was first built in. Swap in a real sequence model trained on real data
without changing inference.py's two functions' signatures, and the backend
doesn't need to change at all.
"""
from pathlib import Path

import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

BEHAVIOR_LABELS = ["grooming", "investigation", "rearing"]
WINDOW_SECONDS = 1.5

MODEL_PATH = Path(__file__).parent / "model.joblib"


def build_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("scale", StandardScaler()),
            ("clf", RandomForestClassifier(n_estimators=150, max_depth=6, random_state=0)),
        ]
    )


def save_model(pipeline: Pipeline, path: Path = MODEL_PATH) -> None:
    joblib.dump(pipeline, path)


def load_model(path: Path = MODEL_PATH) -> Pipeline:
    if not path.exists():
        raise FileNotFoundError(
            f"No trained model at {path}. Run `python train.py` in this directory first."
        )
    return joblib.load(path)
