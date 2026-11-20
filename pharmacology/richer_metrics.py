"""Richer open-field metrics from DeepLabCut pose CSVs (phase B).

Adds, per mouse, what the three whole-session summaries in open_field.py cannot
show: how the effect unfolds over the session, how much time is spent
immobile, and where the mouse is WHEN it is moving (so a mouse that barely
moves is not mistaken for one that "prefers" the center).

    python pharmacology/richer_metrics.py [data_dir] [out.json]
    -> frontend/src/data/open_field_rich.json  (needs the raw data; the
       statistics in dose_response.py then run from this committed JSON)

Choices fixed BEFORE any dose comparison was looked at
 * Speed = displacement of the body centre over a centred 15-frame window,
   divided by the window (px/frame). Smoothing removes tracker jitter that
   would otherwise make a stationary mouse look like it is moving.
 * Immobile = speed < IMMOBILE_PX_PER_FRAME (1.0). The pooled, dose-blind speed
   distribution has no clean valley (a jitter/slow mode around 0.3-0.6 px/frame,
   a locomotion mode around 3-4), so the cut is the lower edge of the plateau
   between them, and results are reported at 0.5 and 2.0 too (SENSITIVITY).
 * Primary metrics (the confirmatory family in dose_response.py):
   immobility_pct and center_pct_moving. Everything else is exploratory.
 * Time courses use N_BINS equal-length bins of frames. Minutes are only given
   under FPS_ASSUMED, which is INFERRED (the dataset states no frame rate).
 * Nothing is converted to cm: the data has no stated physical scale. Distances
   are in arena widths (corner-marker spacing), as in open_field.py.
"""
import json
from pathlib import Path
from typing import Dict, List

import numpy as np

import open_field as of

FPS_ASSUMED = 30  # INFERRED, not verified: the dataset states none (authors' code for these files uses 30; one figure script uses 25)
SPEED_WINDOW = 15
IMMOBILE_PX_PER_FRAME = 1.0
SENSITIVITY = (0.5, 1.0, 2.0)
N_BINS = 6
MIN_BOUT_FRAMES = 15
PRIMARY = ("immobility_pct", "center_pct_moving")
HEAD, TAIL = "nose", "tailbase"


def smoothed_speed(xy: np.ndarray, window: int = SPEED_WINDOW) -> np.ndarray:
    """Speed (px/frame) at each frame from the displacement over a centred
    window. NaN at the edges, and wherever the window contains a missing frame
    or a tracking jump (> MAX_STEP_PX)."""
    half = window // 2
    n = len(xy)
    speed = np.full(n, np.nan)
    if half == 0 or n <= 2 * half:
        return speed
    speed[half:n - half] = np.hypot(*(xy[2 * half:] - xy[:-2 * half]).T) / (2 * half)
    steps = np.hypot(*np.diff(xy, axis=0).T)
    bad = ~(steps <= of.MAX_STEP_PX)  # NaN (missing) or a jump
    cum = np.concatenate([[0], np.cumsum(bad)])
    nbad = cum[2 * half:] - cum[:n - 2 * half]  # steps t-half .. t+half-1 for t = half .. n-half-1
    speed[half:n - half][nbad > 0] = np.nan
    return speed


def _runs(mask: np.ndarray) -> List[int]:
    """Lengths of consecutive True runs."""
    if not mask.any():
        return []
    edges = np.flatnonzero(np.diff(np.concatenate([[0], mask.astype(int), [0]])))
    return [int(e - s) for s, e in zip(edges[::2], edges[1::2])]


def compute_rich(parts: Dict[str, np.ndarray], n_bins: int = N_BINS) -> Dict:
    origin, u, v, side = of.arena_frame(parts)
    for name in (of.BODY_PART, HEAD, TAIL):
        if name not in parts:
            raise ValueError(f"no '{name}' body part in the file")
    track = parts[of.BODY_PART]
    xy = of.clean_track(track[:, :2], track[:, 2])
    valid = ~np.isnan(xy).any(axis=1)
    if valid.sum() < 2 * SPEED_WINDOW:
        raise ValueError(f"only {int(valid.sum())} usable frames after likelihood filtering")

    speed = smoothed_speed(xy)
    has_speed = ~np.isnan(speed)
    if not has_speed.any():
        raise ValueError("no frame has a usable speed estimate")

    norm = np.full(xy.shape, np.nan)
    norm[valid] = of.normalize(xy[valid], origin, u, v)
    inside = (norm >= of.CENTER_LO) & (norm <= of.CENTER_HI)
    in_center = inside.all(axis=1) & valid
    in_corner = (~inside).all(axis=1) & valid  # outside the central band on BOTH axes

    out: Dict = {}
    for t in SENSITIVITY:
        tag = "" if t == IMMOBILE_PX_PER_FRAME else f"_t{t:g}"
        imm = has_speed & (speed < t)
        mov = has_speed & (speed >= t)
        out[f"immobility_pct{tag}"] = float(100 * imm.sum() / has_speed.sum())
        if not (mov & valid).any():
            raise ValueError(f"no moving frames at threshold {t} px/frame: center-time-while-moving is undefined")
        out[f"center_pct_moving{tag}"] = float(100 * in_center[mov & valid].sum() / (mov & valid).sum())

    imm = has_speed & (speed < IMMOBILE_PX_PER_FRAME)
    mov = has_speed & (speed >= IMMOBILE_PX_PER_FRAME)
    bouts = [b for b in _runs(imm) if b >= MIN_BOUT_FRAMES]
    out["immobile_bout_count"] = len(bouts)
    out["longest_immobile_bout_frames"] = max(bouts) if bouts else 0
    out["corner_pct_moving"] = float(100 * in_corner[mov & valid].sum() / (mov & valid).sum())

    nose, tail = parts[HEAD], parts[TAIL]
    ok = (nose[:, 2] >= of.MIN_LIKELIHOOD) & (tail[:, 2] >= of.MIN_LIKELIHOOD)
    out["body_length_arena_widths"] = float(np.median(np.hypot(*(nose[ok, :2] - tail[ok, :2]).T)) / side) if ok.any() else None
    if out["body_length_arena_widths"] is None:
        raise ValueError("no frame has both nose and tailbase tracked")

    steps = np.hypot(*np.diff(xy, axis=0).T)
    good = ~np.isnan(steps) & ~(steps > of.MAX_STEP_PX)
    per_step = np.where(good, steps, 0.0)
    size = len(steps) // n_bins
    out["distance_bins_arena_widths"] = [float(per_step[i * size:(i + 1) * size].sum() / side) for i in range(n_bins)]
    out["frames_per_bin"] = int(size)
    return out


def build(data_dir: Path) -> Dict:
    mice = []
    for row in of.load_metadata(data_dir / "METADATA_ROCHE.csv"):
        try:
            parts = of.read_dlc(data_dir / "data" / "Yohimbine_Roche" / row["DLC file"])
            mice.append({"id": row["Animal ID"], "dose_mg_kg": float(row["Dosage"]), **compute_rich(parts)})
        except (ValueError, KeyError, OSError) as exc:
            raise ValueError(f"animal {row.get('Animal ID', '?')} ({row.get('DLC file', '?')}): {exc}") from exc
    mice.sort(key=lambda m: (m["dose_mg_kg"], m["id"]))
    return {
        "dataset": {"name": "Yohimbine open-field pose tracking", "url": "https://zenodo.org/records/8188683",
                    "license": "CC BY 4.0", "citation": of.CITATION},
        "parameters": {
            "speed_window_frames": SPEED_WINDOW, "immobile_px_per_frame": IMMOBILE_PX_PER_FRAME,
            "sensitivity_px_per_frame": list(SENSITIVITY), "min_bout_frames": MIN_BOUT_FRAMES, "n_bins": N_BINS,
            "primary_metrics": list(PRIMARY),
            "center_definition": "inner 50% of arena area; 'moving' = smoothed speed >= the immobility threshold",
            "corner_definition": "outside the central band on both axes",
            "time_axis": {"fps_assumed": FPS_ASSUMED, "status": "inferred, not verified: the dataset states no frame rate"},
            "units": "arena widths and pixels; no physical scale",
        },
        "mice": mice,
    }


if __name__ == "__main__":
    import sys

    root = Path(__file__).resolve().parent
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else root.parent / "frontend/src/data/open_field_rich.json"
    result = build(Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data")
    out.write_text(json.dumps(result, indent=1, allow_nan=False) + "\n")
    print(f"wrote {len(result['mice'])} mice to {out}")
