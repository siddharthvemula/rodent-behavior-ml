"""Writes frontend/src/data/model_metrics.json, the slice of metrics.json the
"How much to trust this" panel shows. Run after retraining (python
ml/export_frontend_metrics.py); ml/tests/test_frontend_metrics.py fails if the
frontend copy is stale.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "ml" / "metrics.json"
DEST = ROOT / "frontend" / "src" / "data" / "model_metrics.json"


def _mean(values):
    return sum(values) / len(values)


def trimmed(metrics: dict) -> dict:
    runs = metrics["test"]["runs"]
    labels = metrics["test_confusion_matrix_seed0"]["labels"]
    return {
        "_source": "ml/metrics.json via ml/export_frontend_metrics.py; do not edit by hand",
        "dataset": metrics["dataset"],
        "classifier": metrics["classifier"],
        "n_train_recordings": metrics["n_train_recordings"],
        "n_test_recordings": metrics["n_test_recordings"],
        "n_seeds": len(runs),
        "labels": labels,
        "test_f1": {k: round(v, 4) for k, v in metrics["test"]["per_class_f1_mean"].items()},
        "test_macro_f1": round(metrics["test"]["macro_f1_mean"], 4),
        # mean absolute error of each behavior's fraction-of-recording-time, per held-out recording
        "test_time_share_mae": {
            k: round(_mean([r["frequency_error"]["mae_by_label"][k] for r in runs]), 4) for k in labels
        },
        "confusion_rows_true_cols_pred": metrics["test_confusion_matrix_seed0"]["rows_true_cols_pred"],
        "baseline_macro_f1": {
            "always_other": round(metrics["control_always_other"]["macro_f1"], 4),
            "shuffled_labels": round(metrics["control_shuffled_labels"]["macro_f1"], 4),
        },
    }


def main():
    out = trimmed(json.loads(SRC.read_text()))
    DEST.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {DEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
