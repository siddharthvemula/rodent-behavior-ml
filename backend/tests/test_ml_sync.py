"""backend/ml_model/ is a hand-maintained copy of the matching files in ml/
(Vercel builds backend/ on its own and can't reach ../ml/ at runtime). A
stale copy would silently serve an old model, so CI fails if they diverge.

To fix a failure:  cp ml/{features,model,preprocess,inference}.py ml/model.joblib backend/ml_model/
"""
import hashlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SHARED = ["features.py", "model.py", "preprocess.py", "inference.py", "model.joblib"]


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.mark.parametrize("name", SHARED)
def test_backend_copy_matches_ml(name):
    src, copy = ROOT / "ml" / name, ROOT / "backend" / "ml_model" / name
    assert copy.exists(), f"backend/ml_model/{name} is missing"
    assert _sha(src) == _sha(copy), (
        f"backend/ml_model/{name} differs from ml/{name}. "
        "cp ml/{features,model,preprocess,inference}.py ml/model.joblib backend/ml_model/"
    )
