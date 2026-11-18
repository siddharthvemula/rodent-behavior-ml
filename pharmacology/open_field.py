"""Open-field movement metrics from DeepLabCut pose CSVs.

Computes, per mouse, from the `bodycentre` keypoint only:
  - total distance traveled (pixels, and arena widths)
  - % of time in the arena center (inner 50% by area)
  - mean speed over all valid time (pixels/frame)

There is no physical scale in the data, so nothing is converted to cm.
Independent of the CalMS21 classifier (ml/, backend/).
"""

import csv
import json
from pathlib import Path

import numpy as np

BODY_PART = "bodycentre"
MIN_LIKELIHOOD = 0.9
MAX_GAP_FRAMES = 5  # gaps this short are linearly interpolated
MAX_STEP_PX = 50.0  # larger frame-to-frame moves are tracking jumps
# Center = central square with 50% of the arena area: side 1/sqrt(2) of the arena side.
CENTER_LO = (1 - 0.5**0.5) / 2
CENTER_HI = 1 - CENTER_LO

CITATION = (
    "von Ziegler, L. M., Roessler, F. K., Sturman, O., O'Connor, E. C., & Bohacek, J. (2023). "
    "Raw video and pose estimation data of top view open field mouse behavior recordings after "
    "yohimbine injections [Data set]. Zenodo. https://doi.org/10.5281/zenodo.8188683"
)


def read_dlc(path: Path) -> dict[str, np.ndarray]:
    """Parse a DeepLabCut CSV (3 header rows) into {bodypart: (n, 3) array of x, y, likelihood}."""
    with open(path, newline="") as f:
        rows = list(csv.reader(f))
    bodyparts = rows[1][1:]
    data = np.array(rows[3:], dtype=float)[:, 1:]
    out: dict[str, np.ndarray] = {}
    for i in range(0, len(bodyparts), 3):
        out[bodyparts[i]] = data[:, i : i + 3]
    return out


def arena_frame(parts: dict[str, np.ndarray]):
    """Median corner positions -> (origin, u, v, side_px). u = tl->tr, v = tl->bl."""
    c = {k: np.median(parts[k][:, :2], axis=0) for k in ("tl", "tr", "bl")}
    u, v = c["tr"] - c["tl"], c["bl"] - c["tl"]
    return c["tl"], u, v, float((np.linalg.norm(u) + np.linalg.norm(v)) / 2)


def normalize(xy: np.ndarray, origin, u, v) -> np.ndarray:
    """Affine map pixel coordinates to arena coordinates in [0, 1]^2 (inside the arena)."""
    basis = np.column_stack([u, v])
    return np.linalg.solve(basis, (xy - origin).T).T


def clean_track(xy: np.ndarray, likelihood: np.ndarray) -> np.ndarray:
    """Mark low-likelihood frames NaN, then interpolate gaps of <= MAX_GAP_FRAMES."""
    xy = xy.copy()
    bad = likelihood < MIN_LIKELIHOOD
    xy[bad] = np.nan
    n = len(xy)
    i = 0
    while i < n:
        if not bad[i]:
            i += 1
            continue
        j = i
        while j < n and bad[j]:
            j += 1
        if i > 0 and j < n and (j - i) <= MAX_GAP_FRAMES:
            for k in range(2):
                xy[i:j, k] = np.interp(np.arange(i, j), [i - 1, j], [xy[i - 1, k], xy[j, k]])
        i = j
    return xy


def compute_metrics(parts: dict[str, np.ndarray]) -> dict:
    origin, u, v, side = arena_frame(parts)
    track = parts[BODY_PART]
    xy = clean_track(track[:, :2], track[:, 2])
    valid = ~np.isnan(xy).any(axis=1)

    steps = np.hypot(*np.diff(xy, axis=0).T)  # NaN where either frame is missing
    step_ok = ~np.isnan(steps)
    jump = step_ok & (steps > MAX_STEP_PX)
    good = step_ok & ~jump
    distance = float(steps[good].sum())

    norm = normalize(xy[valid], origin, u, v)
    in_center = ((norm >= CENTER_LO) & (norm <= CENTER_HI)).all(axis=1)

    return {
        "n_frames": int(len(xy)),
        "distance_px": distance,
        "distance_arena_widths": distance / side,
        "center_pct": float(100 * in_center.mean()),
        "mean_speed_px_per_frame": distance / max(int(good.sum()), 1),
        "missing_frame_pct": float(100 * (~valid).mean()),
        "jump_steps": int(jump.sum()),
        "excluded_step_pct": float(100 * (1 - good.sum() / (len(xy) - 1))),
        "arena_side_px": side,
    }


def load_metadata(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def build(data_dir: Path) -> dict:
    mice = []
    for row in load_metadata(data_dir / "METADATA_ROCHE.csv"):
        parts = read_dlc(data_dir / "data" / "Yohimbine_Roche" / row["DLC file"])
        mice.append(
            {"id": row["Animal ID"], "dose_mg_kg": float(row["Dosage"]), **compute_metrics(parts)}
        )
    mice.sort(key=lambda m: (m["dose_mg_kg"], m["id"]))
    return {
        "dataset": {
            "name": "Yohimbine open-field pose tracking",
            "url": "https://zenodo.org/records/8188683",
            "license": "CC BY 4.0",
            "citation": CITATION,
        },
        "parameters": {
            "body_part": BODY_PART,
            "min_likelihood": MIN_LIKELIHOOD,
            "max_interpolated_gap_frames": MAX_GAP_FRAMES,
            "max_step_px": MAX_STEP_PX,
            "center_definition": "inner 50% of arena area (central square, side 0.707 of arena side)",
            "units": "pixels and arena widths; no physical scale, frame rate unverified",
        },
        "mice": mice,
    }


if __name__ == "__main__":
    import sys

    root = Path(__file__).resolve().parent
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else root.parent / "frontend/src/data/open_field.json"
    result = build(Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data")
    out.write_text(json.dumps(result, indent=1) + "\n")
    print(f"wrote {len(result['mice'])} mice to {out}")
