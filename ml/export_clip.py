"""
Export a slice of a CalMS21 recording as an upload-ready keypoints JSON
(the format POST /api/predict and /api/compare accept), for demos and manual
testing. Output is NOT committed (it is a slice of the dataset); the repo's
upload size cap is 4 MiB, ~3,000 frames (100 s) fits comfortably.

    python ml/export_clip.py --split test --index 0 --start 0 --seconds 60 -o clip_a.json
    python ml/export_clip.py --list --split test         # recordings, lengths, behavior mix

Needs data/processed/*.npz (python ml/preprocess.py).
"""
import argparse
import json
from pathlib import Path

import numpy as np

import preprocess as P


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--split", choices=["train", "test"], default="test")
    ap.add_argument("--index", type=int, default=0, help="recording index within the split")
    ap.add_argument("--start", type=float, default=0.0, help="start offset in seconds")
    ap.add_argument("--seconds", type=float, default=60.0)
    ap.add_argument("-o", "--out", type=Path)
    ap.add_argument("--list", action="store_true", help="list recordings in the split and exit")
    args = ap.parse_args()

    recs = P.load_recordings(P.DEFAULT_PROCESSED_DIR / f"calms21_task1_{args.split}.npz")
    if args.list:
        for i, r in enumerate(recs):
            share = np.bincount(r.labels, minlength=len(P.BEHAVIOR_LABELS)) / len(r)
            print(f"{i:3d} {r.id}  {len(r) / P.FRAME_RATE:6.0f}s  " +
                  " ".join(f"{n} {v:.0%}" for n, v in zip(P.BEHAVIOR_LABELS, share)))
        return
    if not args.out:
        ap.error("-o/--out is required")
    if not 0 <= args.index < len(recs):
        ap.error(f"--index must be in 0..{len(recs) - 1}")

    r = recs[args.index]
    a = int(args.start * P.FRAME_RATE)
    b = min(a + int(args.seconds * P.FRAME_RATE), len(r))
    if a >= b:
        ap.error(f"--start is past the end of the recording ({len(r) / P.FRAME_RATE:.0f}s)")
    clip = np.round(r.keypoints[a:b], 1)  # 0.1 px is far below tracker noise; keeps the file small
    args.out.write_text(json.dumps(P.to_json_dict(clip, P.FRAME_RATE), separators=(",", ":")))
    true = np.bincount(r.labels[a:b], minlength=len(P.BEHAVIOR_LABELS)) / (b - a)
    print(f"wrote {args.out} ({args.out.stat().st_size / 1e6:.2f} MB, {b - a} frames from {r.id})")
    print("ground-truth mix of this clip: " + ", ".join(f"{n} {v:.0%}" for n, v in zip(P.BEHAVIOR_LABELS, true)))


if __name__ == "__main__":
    main()
