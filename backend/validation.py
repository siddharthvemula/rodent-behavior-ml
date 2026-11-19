"""
Upload validation and repair for keypoints recordings (see HARDENING_PLAN.md).

Everything that decides "is this upload usable?" lives here so the model code
in ml_model/ (a byte-for-byte copy of ml/) never has to change. The output is
the canonical float32 (T, 2, 7, 2) array the existing inference code expects,
plus human-readable warnings for anything we repaired or find suspicious.

Rejections raise UploadRejected(status_code, detail):
  415  not keypoints JSON at all (video, CSV, raw CalMS21, ...)
  422  keypoints JSON that is unusable (bad schema, too short, long gaps, ...)
"""
import json
import re
from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np

from ml_model.preprocess import KEYPOINT_NAMES, N_KEYPOINTS, N_MICE

FRAME_RATE_DEFAULT = 30.0
MIN_FPS, MAX_FPS = 10.0, 500.0
MIN_DURATION_S = 3.0        # shortest CalMS21 training recording is 3.2 s
SHORT_DURATION_S = 10.0     # warn (not reject) below this
MAX_FRAMES = 20_000
MAX_ABS_COORD = 1e5
MAX_GAP_FRAMES = 5          # same repair rule as pharmacology/open_field.py
MIN_MOTION_PX = 1.0
ZERO_POINT_WARN_FRACTION = 0.05

# CalMS21 camera: 1024x570 px, nose-to-tail 116..234 px (5th..95th pct) in training data.
FRAME_W, FRAME_H, FRAME_MARGIN = 1024, 570, 100
BODY_LEN_WARN = (90.0, 300.0)
BODY_LEN_REJECT = (20.0, 800.0)
OUTSIDE_FRAME_WARN_FRACTION = 0.10

NOSE, TAIL = KEYPOINT_NAMES.index("nose"), KEYPOINT_NAMES.index("tail_base")


class UploadRejected(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class Recording:
    keypoints: np.ndarray            # (T, 2, 7, 2) float32, finite
    frame_rate: float
    duration: float                  # seconds, on the original clock
    warnings: List[str] = field(default_factory=list)


# ---------------------------------------------------------------- sniffing

_CALMS21_HEAD = re.compile(rb'"annotator-id_\d+"')
_CALMS21_HINT = (
    "This looks like a raw CalMS21 dataset file. Upload a clip exported as keypoints JSON instead "
    "(python ml/export_clip.py --split test --index 0 --seconds 60 -o clip.json)."
)


def looks_like_calms21(head: bytes) -> bool:
    return bool(_CALMS21_HEAD.search(head[:4096]))


def _calms21_dict(data) -> bool:
    return isinstance(data, dict) and any(
        isinstance(v, dict) and any(isinstance(s, dict) and "keypoints" in s for s in v.values())
        for v in data.values()
    )


def _looks_like_csv(content: bytes) -> bool:
    try:
        text = content[:4096].decode("utf-8-sig")
    except UnicodeDecodeError:
        return False
    first = text.lstrip().split("\n", 1)[0]
    return "," in first and "\n" in text and not first.lstrip().startswith(("{", "["))


def _not_keypoints(label: str, reason: str, extra: str = "") -> UploadRejected:
    return UploadRejected(
        415,
        f"'{label}' is not a keypoints JSON file ({reason}). Only pre-extracted pose keypoints are "
        f"supported; raw video can't be classified yet. See ARCHITECTURE.md 'Data schema'.{extra}",
    )


def _invalid(label: str, reason: str) -> UploadRejected:
    return UploadRejected(
        422, f"'{label}' is not a valid keypoints file: {reason}. See ARCHITECTURE.md 'Data schema'."
    )


def oversized_hint(head: bytes) -> str:
    return f" {_CALMS21_HINT}" if looks_like_calms21(head) else ""


# ---------------------------------------------------------------- parsing

def _read_number(value, where: str, label: str) -> float:
    if value is None:
        return float("nan")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _invalid(label, f"{where}: coordinates must be numbers (or null for a missing point)")
    try:
        return float(value)
    except OverflowError:
        raise _invalid(label, f"{where}: coordinate is out of range") from None


def _parse_frame_rate(data: dict, label: str, warnings: List[str]) -> float:
    if "frame_rate" not in data:
        warnings.append(f"No frame_rate given; assuming {FRAME_RATE_DEFAULT:g} fps.")
        return FRAME_RATE_DEFAULT
    fr = data["frame_rate"]
    if isinstance(fr, bool) or not isinstance(fr, (int, float)):
        raise _invalid(label, "'frame_rate' must be a number")
    fr = float(fr)
    if not np.isfinite(fr) or not (MIN_FPS <= fr <= MAX_FPS):
        raise _invalid(label, f"'frame_rate' must be between {MIN_FPS:g} and {MAX_FPS:g} fps")
    return fr


def _fill_gaps(out: np.ndarray, label: str, warnings: List[str]) -> None:
    """Interpolate NaN runs of <= MAX_GAP_FRAMES per keypoint (in place);
    reject longer runs rather than invent motion."""
    repaired = 0
    for m in range(N_MICE):
        for k in range(N_KEYPOINTS):
            missing = np.isnan(out[:, m, k]).any(axis=1)
            if not missing.any():
                continue
            where = f"mouse {m} '{KEYPOINT_NAMES[k]}'"
            if missing.all():
                raise _invalid(label, f"{where} is missing in every frame")
            edges = np.diff(np.concatenate([[0], missing.astype(np.int8), [0]]))
            for a, b in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)):
                if b - a > MAX_GAP_FRAMES:
                    raise _invalid(
                        label,
                        f"{where} is missing for {b - a} frames in a row (frames {a}-{b - 1}); "
                        f"gaps up to {MAX_GAP_FRAMES} frames are repaired automatically, longer ones are not",
                    )
            good = np.flatnonzero(~missing)
            bad = np.flatnonzero(missing)
            for c in range(2):
                out[bad, m, k, c] = np.interp(bad, good, out[good, m, k, c])
            repaired += len(bad)
    if repaired:
        warnings.append(
            f"{repaired} missing keypoint values (null/NaN) were filled by interpolation "
            f"(gaps of up to {MAX_GAP_FRAMES} frames)."
        )


def _sanity_checks(kp: np.ndarray, label: str, warnings: List[str]) -> None:
    if float(np.ptp(kp, axis=0).max()) < MIN_MOTION_PX:
        raise _invalid(label, "no movement in the whole recording (all keypoints are constant), nothing to classify")

    zero_frac = float(((kp == 0).all(axis=-1)).mean())
    if zero_frac > ZERO_POINT_WARN_FRACTION:
        warnings.append(
            f"{zero_frac:.0%} of keypoints are exactly (0, 0), which is often a tracker dropout marker; "
            "results may be unreliable."
        )

    body = np.linalg.norm(kp[:, :, NOSE] - kp[:, :, TAIL], axis=-1)
    med = float(np.median(body))
    if not (BODY_LEN_REJECT[0] <= med <= BODY_LEN_REJECT[1]):
        raise _invalid(
            label,
            f"median nose-to-tail length is {med:.0f} px, far from CalMS21's ~180 px on a {FRAME_W}x{FRAME_H} frame; "
            "coordinates must be pixels in that frame",
        )
    outside = (
        (kp[..., 0] < -FRAME_MARGIN) | (kp[..., 0] > FRAME_W + FRAME_MARGIN)
        | (kp[..., 1] < -FRAME_MARGIN) | (kp[..., 1] > FRAME_H + FRAME_MARGIN)
    ).mean()
    if not (BODY_LEN_WARN[0] <= med <= BODY_LEN_WARN[1]) or outside > OUTSIDE_FRAME_WARN_FRACTION:
        warnings.append(
            f"Coordinates don't look like CalMS21's {FRAME_W}x{FRAME_H} pixel frame (median nose-to-tail "
            f"{med:.0f} px vs ~180 px; {outside:.0%} of points outside the frame). Results may be unreliable."
        )


def validate_recording(content: bytes, label: str) -> Recording:
    """Parse, check and repair one upload. See module docstring."""
    try:
        data = json.loads(content)
    except (ValueError, UnicodeDecodeError, RecursionError):
        if _looks_like_csv(content):
            raise _not_keypoints(
                label, "looks like CSV", " CSV pose files are not supported; upload keypoints JSON."
            ) from None
        raise _not_keypoints(label, "not valid JSON") from None

    if not isinstance(data, dict) or "frames" not in data:
        if _calms21_dict(data):
            raise _not_keypoints(label, "raw CalMS21 file", f" {_CALMS21_HINT}")
        raise _not_keypoints(label, "missing 'frames'")

    warnings: List[str] = []
    frame_rate = _parse_frame_rate(data, label, warnings)

    frames = data["frames"]
    if not isinstance(frames, list) or len(frames) == 0:
        raise _invalid(label, "'frames' must be a non-empty list")
    if len(frames) > MAX_FRAMES:
        raise _invalid(label, f"{len(frames)} frames is over the {MAX_FRAMES}-frame limit; trim the clip")
    duration = len(frames) / frame_rate

    out = np.empty((len(frames), N_MICE, N_KEYPOINTS, 2), dtype=np.float64)
    for t, frame in enumerate(frames):
        mice = frame.get("mice") if isinstance(frame, dict) else None
        if not isinstance(mice, list) or len(mice) != N_MICE:
            raise _invalid(label, f"frame {t}: needs 'mice', a list of {N_MICE} mice (resident first, intruder second)")
        for m, mouse in enumerate(mice):
            if not isinstance(mouse, dict) or any(name not in mouse for name in KEYPOINT_NAMES):
                raise _invalid(label, f"frame {t}, mouse {m}: needs keys {KEYPOINT_NAMES}")
            for k, name in enumerate(KEYPOINT_NAMES):
                where = f"frame {t}, mouse {m}, '{name}'"
                pt = mouse[name]
                if not isinstance(pt, (list, tuple)) or len(pt) != 2:
                    raise _invalid(label, f"{where}: must be [x, y]")
                out[t, m, k, 0] = _read_number(pt[0], where, label)
                out[t, m, k, 1] = _read_number(pt[1], where, label)

    if duration < MIN_DURATION_S:  # after the schema check so a malformed file reports its real problem
        raise _invalid(
            label,
            f"recording is only {duration:.1f} s ({len(frames)} frames at {frame_rate:g} fps); "
            f"at least {MIN_DURATION_S:g} s is needed for reliable classification",
        )

    with np.errstate(invalid="ignore"):
        bad = np.argwhere(np.abs(out) > MAX_ABS_COORD)
    if len(bad):
        t, m, k, _ = bad[0]
        raise _invalid(label, f"frame {t}, mouse {m}, '{KEYPOINT_NAMES[k]}': coordinate is out of range (|value| > {MAX_ABS_COORD:g})")

    _fill_gaps(out, label, warnings)
    kp = out.astype(np.float32)
    _sanity_checks(kp, label, warnings)
    if duration < SHORT_DURATION_S:
        warnings.append(
            f"Short recording ({duration:.1f} s): behavior percentages from so little data are noisy."
        )
    return Recording(kp, frame_rate, duration, warnings)
