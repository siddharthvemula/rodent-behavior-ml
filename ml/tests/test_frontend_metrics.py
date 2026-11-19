"""The frontend bundles a trimmed copy of metrics.json; fail if it goes stale.
Fix: python ml/export_frontend_metrics.py"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import export_frontend_metrics as E


def test_frontend_metrics_copy_is_current():
    expected = E.trimmed(json.loads(E.SRC.read_text()))
    assert json.loads(E.DEST.read_text()) == expected, "run: python ml/export_frontend_metrics.py"
