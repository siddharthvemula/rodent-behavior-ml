"""
Keypoint I/O for the CalMS21 dyadic schema (see ARCHITECTURE.md "Data schema").

Two kinds of input end up in the same in-memory form:

  * an uploaded recording (JSON, the API contract), via parse_keypoints_json
  * a CalMS21 Task 1 file (training data), via load_calms21

The canonical in-memory form is a float32 ndarray `keypoints` of shape
(T, 2, 7, 2) = (frame, mouse, body part, x/y), pixels on CalMS21's
1024x570 frame. Mouse 0 is the resident (black), mouse 1 the intruder
(white); CalMS21's labels describe behavior initiated by the resident.
Body-part order is KEYPOINT_NAMES.

NOTE: CalMS21's own arrays are (T, mouse, x/y, part). That axis order is
swapped here once, in calms21_to_canonical, so nothing downstream has to
remember it.

Command line (builds the compact cache that train.py / Colab load):
    python ml/preprocess.py [--raw-dir data/raw/calms21] [--out-dir data/processed]
"""
import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence as SequenceT, Tuple

import numpy as np

# CalMS21 body-part order (readme): nose, left ear, right ear, neck, left hip,
# right hip, tail base. These are also the JSON keys of the upload contract.
KEYPOINT_NAMES = ["nose", "ear_left", "ear_right", "neck", "hip_left", "hip_right", "tail_base"]
N_MICE = 2
N_KEYPOINTS = len(KEYPOINT_NAMES)

# Index == CalMS21 annotation id.
BEHAVIOR_LABELS = ["attack", "investigation", "mount", "other"]

# CalMS21 is recorded at 30 Hz (NeurIPS 2021 datasets & benchmarks paper).
FRAME_RATE = 30.0
IMAGE_WIDTH, IMAGE_HEIGHT = 1024, 570

# Accepted range for an uploaded recording's frame_rate. Inference resamples
# to 30 Hz, so an absurd rate (e.g. 0.001) would otherwise allocate millions
# of frames from a tiny upload.
MIN_UPLOAD_FRAME_RATE, MAX_UPLOAD_FRAME_RATE = 1.0, 500.0

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw" / "calms21"
DEFAULT_PROCESSED_DIR = REPO_ROOT / "data" / "processed"


class KeypointsFormatError(ValueError):
    """Raised when uploaded bytes don't parse as the keypoints JSON contract,
    or a CalMS21 file doesn't have the layout this module expects."""


# --------------------------------------------------------------------------
# Uploaded recordings (API contract)
# --------------------------------------------------------------------------

def parse_keypoints_json(raw: bytes) -> Tuple[np.ndarray, float]:
    """Parse uploaded bytes as the keypoints JSON contract.

    Returns (keypoints, frame_rate) with keypoints canonical (T, 2, 7, 2)
    float32. Raises KeypointsFormatError (never a bare JSONDecodeError /
    KeyError / IndexError) so callers can cleanly fall back to something
    else, e.g. a raw video file that isn't keypoints at all. This is the one
    place that knows what "looks like a valid keypoints file" means.
    """
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise KeypointsFormatError("not valid JSON") from exc

    if not isinstance(data, dict) or "frames" not in data:
        raise KeypointsFormatError("missing 'frames'")

    try:
        frame_rate = float(data.get("frame_rate", FRAME_RATE))
    except (TypeError, ValueError) as exc:
        raise KeypointsFormatError("'frame_rate' must be a number") from exc
    if not np.isfinite(frame_rate) or not (MIN_UPLOAD_FRAME_RATE <= frame_rate <= MAX_UPLOAD_FRAME_RATE):
        raise KeypointsFormatError(
            f"'frame_rate' must be between {MIN_UPLOAD_FRAME_RATE:g} and {MAX_UPLOAD_FRAME_RATE:g}"
        )

    frames = data["frames"]
    if not isinstance(frames, list) or len(frames) == 0:
        raise KeypointsFormatError("'frames' must be a non-empty list")

    out = np.empty((len(frames), N_MICE, N_KEYPOINTS, 2), dtype=np.float32)
    for t, frame in enumerate(frames):
        mice = frame.get("mice") if isinstance(frame, dict) else None
        if not isinstance(mice, list) or len(mice) != N_MICE:
            raise KeypointsFormatError(
                f"frame {t}: needs 'mice', a list of {N_MICE} mice (resident first, intruder second)"
            )
        for m, mouse in enumerate(mice):
            if not isinstance(mouse, dict) or any(name not in mouse for name in KEYPOINT_NAMES):
                raise KeypointsFormatError(f"frame {t}, mouse {m}: needs keys {KEYPOINT_NAMES}")
            for k, name in enumerate(KEYPOINT_NAMES):
                try:
                    x, y = mouse[name]
                    out[t, m, k] = (float(x), float(y))
                except (TypeError, ValueError) as exc:
                    raise KeypointsFormatError(
                        f"frame {t}, mouse {m}, '{name}': must be [x, y] numbers"
                    ) from exc

    if not np.isfinite(out).all():
        raise KeypointsFormatError("keypoints contain NaN or infinite values")
    return out, frame_rate


def to_json_dict(keypoints: np.ndarray, frame_rate: float = FRAME_RATE) -> dict:
    """Inverse of parse_keypoints_json: canonical (T, 2, 7, 2) array -> the
    upload-contract dict. Used for sample files and tests."""
    _check_canonical(keypoints)
    frames = [
        {
            "mice": [
                {name: [float(x), float(y)] for name, (x, y) in zip(KEYPOINT_NAMES, mouse)}
                for mouse in frame
            ]
        }
        for frame in keypoints
    ]
    return {"frame_rate": float(frame_rate), "frames": frames}


def resample_keypoints(keypoints: np.ndarray, frame_rate: float, target_rate: float = FRAME_RATE) -> np.ndarray:
    """Linearly resample (T, 2, 7, 2) keypoints recorded at `frame_rate` to
    `target_rate`, so frame-based features always see 30 Hz motion. Returns
    the input unchanged when the rates already match (within 1%)."""
    _check_canonical(keypoints)
    if abs(frame_rate - target_rate) <= 0.01 * target_rate or len(keypoints) < 2:
        return keypoints
    duration = (len(keypoints) - 1) / frame_rate
    t_out = np.arange(int(np.floor(duration * target_rate)) + 1) / target_rate
    t_in = np.arange(len(keypoints)) / frame_rate
    flat = keypoints.reshape(len(keypoints), -1)
    out = np.stack([np.interp(t_out, t_in, flat[:, c]) for c in range(flat.shape[1])], axis=1)
    return out.reshape(len(t_out), *keypoints.shape[1:]).astype(np.float32)


def _check_canonical(keypoints: np.ndarray) -> None:
    if keypoints.ndim != 4 or keypoints.shape[1:] != (N_MICE, N_KEYPOINTS, 2):
        raise KeypointsFormatError(
            f"expected keypoints of shape (T, {N_MICE}, {N_KEYPOINTS}, 2), got {keypoints.shape}"
        )


# --------------------------------------------------------------------------
# CalMS21 Task 1 (training data)
# --------------------------------------------------------------------------

@dataclass
class Recording:
    """One CalMS21 sequence (one video)."""
    id: str                  # e.g. "task1/train/mouse001_task1_annotator1"
    keypoints: np.ndarray    # (T, 2, 7, 2) float32, canonical
    scores: np.ndarray       # (T, 2, 7) float32, tracker confidence in [0, 1]
    labels: np.ndarray       # (T,) int8, index into BEHAVIOR_LABELS

    def __len__(self) -> int:
        return len(self.labels)


def calms21_to_canonical(raw_keypoints: np.ndarray) -> np.ndarray:
    """CalMS21 (T, mouse, x/y, part) -> canonical (T, mouse, part, x/y)."""
    if raw_keypoints.ndim != 4 or raw_keypoints.shape[1:] != (N_MICE, 2, N_KEYPOINTS):
        raise KeypointsFormatError(
            f"expected CalMS21 keypoints of shape (T, {N_MICE}, 2, {N_KEYPOINTS}), got {raw_keypoints.shape}"
        )
    return np.ascontiguousarray(raw_keypoints.transpose(0, 1, 3, 2), dtype=np.float32)


def _check_vocab(vocab: dict, where: str) -> None:
    expected = {name: i for i, name in enumerate(BEHAVIOR_LABELS)}
    if vocab != expected:
        raise KeypointsFormatError(f"{where}: label vocab {vocab} != expected {expected}")


def load_calms21(path: Path) -> List[Recording]:
    """Load one CalMS21 Task 1 JSON (calms21_task1_train.json / _test.json).

    Parses the whole file into memory (the train file is ~1.1 GB of
    pretty-printed JSON, about 3 GB of RAM while parsing), so for repeated
    use convert it once with save_recordings / the CLI and load the .npz
    with load_recordings instead.

    Validates, per sequence: array shapes, finite keypoints, labels inside
    the four-label vocab, and that the file's own `metadata.vocab` matches
    BEHAVIOR_LABELS (so a re-numbered release fails loudly instead of
    silently mislabeling).
    """
    with open(path) as fp:
        data = json.load(fp)

    recordings: List[Recording] = []
    for group, sequences in data.items():  # top level is annotator id, e.g. "annotator-id_0"
        for seq_id, seq in sequences.items():
            where = f"{path.name}:{seq_id}"
            if "annotations" not in seq:
                raise KeypointsFormatError(f"{where}: no 'annotations' (is this an unlabeled file?)")
            if "metadata" in seq and "vocab" in seq["metadata"]:
                _check_vocab(seq["metadata"]["vocab"], where)

            keypoints = calms21_to_canonical(np.asarray(seq["keypoints"], dtype=np.float32))
            scores = np.asarray(seq["scores"], dtype=np.float32)
            labels = np.asarray(seq["annotations"])

            n = len(keypoints)
            if scores.shape != (n, N_MICE, N_KEYPOINTS) or labels.shape != (n,):
                raise KeypointsFormatError(
                    f"{where}: inconsistent lengths: keypoints {keypoints.shape}, "
                    f"scores {scores.shape}, annotations {labels.shape}"
                )
            if not np.isfinite(keypoints).all():
                raise KeypointsFormatError(f"{where}: non-finite keypoints")
            if labels.min() < 0 or labels.max() >= len(BEHAVIOR_LABELS):
                raise KeypointsFormatError(f"{where}: label ids outside 0..{len(BEHAVIOR_LABELS) - 1}")

            recordings.append(Recording(seq_id, keypoints, scores, labels.astype(np.int8)))
        del sequences
    return recordings


def train_val_split(
    recordings: SequenceT[Recording], val_fraction: float = 0.2, seed: int = 0
) -> Tuple[List[Recording], List[Recording]]:
    """Split by recording, never by frame or window.

    Neighbouring frames are near-duplicates, so a frame-level split would
    leak and inflate validation scores. CalMS21's own train/test split is
    already by animal identity; this keeps the same discipline inside train.
    (Sequences are one video each; mouse ids differ between videos.)
    """
    if not 0 < val_fraction < 1:
        raise ValueError("val_fraction must be in (0, 1)")
    if len(recordings) < 2:
        raise ValueError("need at least 2 recordings to split")
    order = np.random.default_rng(seed).permutation(len(recordings))
    n_val = min(max(1, round(len(recordings) * val_fraction)), len(recordings) - 1)
    val_idx = set(order[:n_val].tolist())
    train = [r for i, r in enumerate(recordings) if i not in val_idx]
    val = [r for i, r in enumerate(recordings) if i in val_idx]
    return train, val


def label_counts(recordings: SequenceT[Recording]) -> Dict[str, int]:
    """Frame count per behavior label across recordings."""
    total = np.zeros(len(BEHAVIOR_LABELS), dtype=np.int64)
    for r in recordings:
        total += np.bincount(r.labels, minlength=len(BEHAVIOR_LABELS))
    return {name: int(c) for name, c in zip(BEHAVIOR_LABELS, total)}


# --------------------------------------------------------------------------
# Compact cache (.npz): fast to reload, small enough to upload to Colab
# --------------------------------------------------------------------------

def save_recordings(recordings: SequenceT[Recording], path: Path) -> None:
    """Concatenate all recordings into one compressed .npz (+ offsets/ids)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    offsets = np.cumsum([0] + [len(r) for r in recordings]).astype(np.int64)
    np.savez_compressed(
        path,
        keypoints=np.concatenate([r.keypoints for r in recordings]),
        scores=np.concatenate([r.scores for r in recordings]),
        labels=np.concatenate([r.labels for r in recordings]),
        offsets=offsets,
        ids=np.array([r.id for r in recordings]),
        behavior_labels=np.array(BEHAVIOR_LABELS),
        keypoint_names=np.array(KEYPOINT_NAMES),
    )


def load_recordings(path: Path) -> List[Recording]:
    """Load a .npz written by save_recordings (no pickle needed)."""
    with np.load(path, allow_pickle=False) as z:
        if z["behavior_labels"].tolist() != BEHAVIOR_LABELS or z["keypoint_names"].tolist() != KEYPOINT_NAMES:
            raise KeypointsFormatError(f"{path.name}: written with a different label/keypoint order; rebuild it")
        keypoints, scores, labels = z["keypoints"], z["scores"], z["labels"]
        offsets, ids = z["offsets"], z["ids"]
    return [
        Recording(str(ids[i]), keypoints[a:b], scores[a:b], labels[a:b])
        for i, (a, b) in enumerate(zip(offsets[:-1], offsets[1:]))
    ]


def main(argv: Optional[List[str]] = None) -> None:
    ap = argparse.ArgumentParser(description="Convert CalMS21 Task 1 JSON to compact .npz caches.")
    ap.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_PROCESSED_DIR)
    args = ap.parse_args(argv)

    for split in ("train", "test"):
        src = args.raw_dir / f"calms21_task1_{split}.json"
        if not src.exists():
            raise SystemExit(f"{src} not found; run ml/download_data.py first")
        dst = args.out_dir / f"calms21_task1_{split}.npz"
        print(f"{src.name} -> {dst}")
        recs = load_calms21(src)
        save_recordings(recs, dst)
        counts = label_counts(recs)
        total = sum(counts.values())
        print(f"  {len(recs)} recordings, {total} frames ({total / FRAME_RATE / 60:.0f} min at {FRAME_RATE:g} Hz)")
        print("  labels: " + ", ".join(f"{k} {v} ({v / total:.1%})" for k, v in counts.items()))
        print(f"  wrote {dst.stat().st_size / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
