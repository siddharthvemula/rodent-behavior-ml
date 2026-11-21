"""
Precompute the guided-demo data for two keypoint clips: the model's real
predictions, the human annotations for the same frames, and the A-vs-B
comparison, written to frontend/src/data/demo_clips.json.

    python ml/export_demo_clips.py clip_a.json clip_b.json

The clips are upload-ready keypoint files (see export_clip.py; they are slices
of CalMS21 and are NOT committed). For each one this script:

 1. proves the clip is a verbatim slice of a recording in the official TEST
    split (the model never trained on it) and refuses anything else, so a demo
    can never show "predicted vs annotated" on training data;
 2. takes the dataset's annotations for exactly those frames (run-length
    encoded) - these are CalMS21's labels, committed under CC BY 4.0 with
    attribution, only for these two clips;
 3. runs the same code path the backend uses (predict_behaviors,
    compare_with_intervals) on the clip, so the stored output is what an upload
    would return;
 4. records agreement between the two (accuracy, per-class F1, confusion).

The clips are called "Clip A" / "Clip B" everywhere. The output never uses the
two-group labels inference.compare_with_intervals returns for its inputs: the
comparison is stored under neutral keys a / b (and difference = b minus a).

Needs data/processed/calms21_task1_{train,test}.npz and the trained model.
"""
import argparse
import hashlib
import json
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

import inference as I
import model as M
import preprocess as P

REPO_ROOT = Path(__file__).resolve().parent.parent
PROCESSED = REPO_ROOT / "data" / "processed"
DEFAULT_OUT = REPO_ROOT / "frontend" / "src" / "data" / "demo_clips.json"
LABELS = list(P.BEHAVIOR_LABELS)
# Clips were exported rounded to 0.1 px (export_clip.py), so a true match differs by <= 0.05.
MATCH_TOL = 0.06

CLIP_NAMES = (("clip_a", "Clip A"), ("clip_b", "Clip B"))

ATTRIBUTION = {
    "dataset": "CalMS21 Task 1 (Caltech Mouse Social Interactions)",
    "citation": 'Sun et al. (2021), "The Multi-Agent Behavior Dataset: Mouse Dyadic Social Interactions"',
    "url": "https://data.caltech.edu/records/s0vdx-0k302",
    "license": "CC BY 4.0",
    "license_url": "https://creativecommons.org/licenses/by/4.0/",
    "changes": (
        "Annotations are the dataset's frame labels for the first 100 seconds (3,000 frames) of two test-split "
        "recordings, converted to run-length segments. Predictions, agreement statistics and the comparison are "
        "ours, produced by this project's classifier, and are not part of the dataset."
    ),
}


class SourceError(ValueError):
    """The clip is not a verbatim slice of a test-split recording."""


def find_slice(keypoints: np.ndarray, recordings: Sequence[P.Recording], tol: float = MATCH_TOL) -> List[Tuple[int, int]]:
    """All (recording index, start frame) where `keypoints` equals that slice of the recording."""
    clip = np.asarray(keypoints, dtype=np.float64)
    n = len(clip)
    hits: List[Tuple[int, int]] = []
    for ri, rec in enumerate(recordings):
        kp = rec.keypoints.astype(np.float64)
        if len(kp) < n:
            continue
        starts = len(kp) - n + 1
        first = np.abs(kp[:starts] - clip[0]).reshape(starts, -1).max(axis=1)  # cheap: match frame 0 first
        for a in np.flatnonzero(first <= tol):
            if np.abs(kp[a:a + n] - clip).max() <= tol:
                hits.append((ri, int(a)))
    return hits


def locate_in_test(keypoints: np.ndarray, train: Sequence[P.Recording], test: Sequence[P.Recording]) -> Tuple[int, int]:
    """(test recording index, start frame), or SourceError. Refuses a clip that also (or only) matches train."""
    if find_slice(keypoints, train):
        raise SourceError("this clip is a slice of a TRAIN recording; predictions on it would flatter the model")
    hits = find_slice(keypoints, test)
    if not hits:
        raise SourceError("this clip is not a verbatim slice of any test-split recording")
    if len(hits) > 1:
        raise SourceError(f"this clip matches {len(hits)} places in the test split, so its source is ambiguous")
    return hits[0]


def label_segments(labels: np.ndarray, frame_rate: float = P.FRAME_RATE) -> List[dict]:
    """Run-length encode per-frame labels into {start_time, end_time, behavior_label} segments."""
    labels = np.asarray(labels)
    if len(labels) == 0:
        return []
    change = np.flatnonzero(np.diff(labels)) + 1
    starts = np.concatenate([[0], change])
    ends = np.concatenate([change, [len(labels)]])
    return [
        {"start_time": round(float(a) / frame_rate, 3), "end_time": round(float(b) / frame_rate, 3),
         "behavior_label": LABELS[int(labels[a])]}
        for a, b in zip(starts, ends)
    ]


def agreement(truth: np.ndarray, pred: np.ndarray) -> dict:
    """Frame-level agreement of predicted vs annotated labels for one clip."""
    n = len(LABELS)
    cm = np.bincount(np.asarray(truth) * n + np.asarray(pred), minlength=n * n).reshape(n, n)
    tp = np.diag(cm).astype(float)
    denom = cm.sum(0) + cm.sum(1)
    f1 = np.divide(2 * tp, denom, out=np.zeros(n), where=denom > 0)
    present = cm.sum(1) > 0
    return {
        "frames": int(cm.sum()),
        "accuracy": round(float(tp.sum() / cm.sum()), 4),
        # F1 only for classes that occur in the annotation; an absent class has no F1, not a zero one.
        "per_class_f1": {k: (round(float(f), 4) if p else None) for k, f, p in zip(LABELS, f1, present)},
        "macro_f1_present_classes": round(float(f1[present].mean()), 4),
        "confusion_rows_annotated_cols_predicted": cm.tolist(),
        "time_share_annotated": {k: round(float(v), 4) for k, v in zip(LABELS, cm.sum(1) / cm.sum())},
        "time_share_predicted": {k: round(float(v), 4) for k, v in zip(LABELS, cm.sum(0) / cm.sum())},
    }


def model_fingerprint() -> dict:
    """Identifies the exact model these predictions came from, so a retrain makes the file visibly stale."""
    clf, meta = M.load_model()
    return {
        "sha256": hashlib.sha256(M.MODEL_PATH.read_bytes()).hexdigest(),
        "n_features": int(meta["n_features"]),
        "smoothing_window": int(meta["smoothing_window"]),
        "sklearn_version": meta["sklearn_version"],
    }


def build(clip_paths: Sequence[Path], out_path: Optional[Path] = None) -> Dict:
    if len(clip_paths) != len(CLIP_NAMES):
        raise ValueError(f"expected {len(CLIP_NAMES)} clips, got {len(clip_paths)}")
    train = P.load_recordings(PROCESSED / "calms21_task1_train.npz")
    test = P.load_recordings(PROCESSED / "calms21_task1_test.npz")

    parsed, clips = [], []
    for path, (clip_id, label) in zip(clip_paths, CLIP_NAMES):
        kp, fps = P.parse_keypoints_json(Path(path).read_bytes())
        try:
            ri, start = locate_in_test(kp, train, test)
        except SourceError as exc:
            raise SourceError(f"{label} ({Path(path).name}): {exc}") from exc
        rec = test[ri]
        n = len(kp)
        truth = rec.labels[start:start + n]
        pred_labels, _ = I.predict_frames(kp, fps)
        if len(pred_labels) != len(truth):
            raise ValueError(f"{label}: predicted {len(pred_labels)} frames but the annotation has {len(truth)}")
        parsed.append(kp)
        clips.append({
            "id": clip_id,
            "label": label,
            "source": {"split": "test", "recording": rec.id, "start_frame": start, "frames": int(n),
                       "seconds": round(n / fps, 2), "frame_rate": float(fps)},
            "annotations": label_segments(truth, fps),
            "predictions": I.predict_behaviors(kp, fps),
            "agreement": agreement(truth, pred_labels),
        })

    result, intervals = I.compare_with_intervals(parsed[0], parsed[1])
    rename = {"control": "a", "treated": "b", "difference": "difference"}   # neutral keys: A, B and B minus A
    out = {
        "_source": "ml/export_demo_clips.py; do not edit by hand",
        "attribution": ATTRIBUTION,
        "model": model_fingerprint(),
        "behaviors": LABELS,
        "clips": clips,
        "compare": {rename[k]: v for k, v in result.items()},
        "compare_intervals": {"level": intervals["level"], **{rename[k]: v for k, v in intervals.items() if k != "level"}},
    }
    if out_path is not None:
        out_path.write_text(json.dumps(out, indent=1, allow_nan=False) + "\n")
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("clips", nargs=2, type=Path, metavar="CLIP", help="clip A and clip B keypoint JSON files")
    ap.add_argument("-o", "--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    out = build(args.clips, args.out)
    print(f"wrote {args.out} ({args.out.stat().st_size / 1e3:.1f} KB)")
    for c in out["clips"]:
        s, a = c["source"], c["agreement"]
        print(f"  {c['label']}: {s['recording']} frames {s['start_frame']}-{s['start_frame'] + s['frames']} "
              f"({len(c['annotations'])} annotated / {len(c['predictions'])} predicted segments), "
              f"frame accuracy {a['accuracy']:.3f}, macro-F1 over present classes {a['macro_f1_present_classes']:.3f}")


if __name__ == "__main__":
    main()
