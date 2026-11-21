"""
Per-frame features for the scikit-learn baseline.

Input: canonical keypoints, float array (T, 2, 7, 2) = (frame, mouse, body
part, x/y), mouse 0 = resident, mouse 1 = intruder (see preprocess.py).
Output: float32 (T, n_features), one row per frame, plus FEATURE_NAMES.

Design notes
 * Keypoints only. CalMS21 also ships per-point tracker scores, but uploaded
   recordings don't have them, so using them would create a train/inference
   mismatch.
 * Base features are geometric and (mostly) in pixels. CalMS21 is one fixed
   camera setup, so pixel scale is consistent; no per-video normalization.
   Absolute position in the arena is deliberately NOT a feature (it would
   let the model memorize cage layout rather than behavior).
 * Behaviors unfold over a fraction of a second to seconds, so each base
   feature also gets centered rolling mean/std at a few time scales.
   Windows are defined in frames at 30 Hz (inference resamples to 30 Hz).
 * Everything is vectorized and causal-free (windows are centered), so a
   whole recording is featurized in one call; short recordings are padded by
   edge replication.
"""
from typing import List, Tuple

import numpy as np

try:
    from .preprocess import N_KEYPOINTS, N_MICE
except ImportError:  # flat-script layout (python ml/train.py)
    from preprocess import N_KEYPOINTS, N_MICE

NOSE, EAR_L, EAR_R, NECK, HIP_L, HIP_R, TAIL = range(7)

# Window lengths in frames at 30 Hz: ~0.17 s, 0.5 s, 1.5 s.
WINDOWS = (5, 15, 45)

EPS = 1e-6
MOUSE_NAMES = ("res", "int")  # resident, intruder


def _unit(v: np.ndarray) -> np.ndarray:
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + EPS)


def _dist(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.linalg.norm(a - b, axis=-1)


def _grad(x: np.ndarray) -> np.ndarray:
    """Central difference along time (per frame), same length as x."""
    if len(x) < 2:
        return np.zeros_like(x)
    return np.gradient(x, axis=0)


def base_features(kp: np.ndarray, extra: bool = False) -> Tuple[np.ndarray, List[str]]:
    """Instantaneous geometric features, (T, n_base). `extra` appends the v2
    additions AFTER the v1 columns, so v1 column order never changes."""
    if kp.ndim != 4 or kp.shape[1:] != (N_MICE, N_KEYPOINTS, 2):
        raise ValueError(f"expected keypoints (T, {N_MICE}, {N_KEYPOINTS}, 2), got {kp.shape}")
    kp = kp.astype(np.float64)

    # Body centre = mean of the torso points (CalMS21 has no centre keypoint).
    centre = kp[:, :, [NECK, HIP_L, HIP_R], :].mean(axis=2)          # (T, 2, 2)
    heading = _unit(kp[:, :, NOSE] - kp[:, :, TAIL])                  # tail -> nose, (T, 2, 2)

    cols: List[np.ndarray] = []
    names: List[str] = []

    def add(name: str, values: np.ndarray) -> None:
        cols.append(np.asarray(values, dtype=np.float64))
        names.append(name)

    # ---- per mouse ----
    for m, mn in enumerate(MOUSE_NAMES):
        add(f"{mn}_body_len", _dist(kp[:, m, NOSE], kp[:, m, TAIL]))
        add(f"{mn}_head_len", _dist(kp[:, m, NOSE], kp[:, m, NECK]))
        add(f"{mn}_hip_width", _dist(kp[:, m, HIP_L], kp[:, m, HIP_R]))
        add(f"{mn}_centre_speed", np.linalg.norm(_grad(centre[:, m]), axis=-1))
        add(f"{mn}_nose_speed", np.linalg.norm(_grad(kp[:, m, NOSE]), axis=-1))
        add(f"{mn}_tail_speed", np.linalg.norm(_grad(kp[:, m, TAIL]), axis=-1))
        # Turning rate: signed angle between heading one frame ahead and behind.
        h = heading[:, m]
        ahead, behind = np.roll(h, -1, axis=0), np.roll(h, 1, axis=0)
        if len(h) > 1:
            ahead[-1], behind[0] = h[-1], h[0]
        cross = behind[:, 0] * ahead[:, 1] - behind[:, 1] * ahead[:, 0]
        dot = (behind * ahead).sum(-1)
        add(f"{mn}_turn_rate", np.arctan2(cross, dot))

    # ---- dyad geometry ----
    r, i = 0, 1
    d_cc = _dist(centre[:, r], centre[:, i])
    add("d_centre_centre", d_cc)
    add("d_nose_nose", _dist(kp[:, r, NOSE], kp[:, i, NOSE]))
    add("d_resnose_intcentre", _dist(kp[:, r, NOSE], centre[:, i]))
    add("d_intnose_rescentre", _dist(kp[:, i, NOSE], centre[:, r]))
    add("d_resnose_inttail", _dist(kp[:, r, NOSE], kp[:, i, TAIL]))
    add("d_intnose_restail", _dist(kp[:, i, NOSE], kp[:, r, TAIL]))

    # Closest approach between any resident point and any intruder point.
    pair = np.linalg.norm(kp[:, r, :, None, :] - kp[:, i, None, :, :], axis=-1)  # (T, 7, 7)
    add("d_min_any", pair.reshape(len(kp), -1).min(axis=1))
    add("d_resnose_min_int", pair[:, NOSE, :].min(axis=1))   # resident nose to nearest intruder point
    add("d_intnose_min_res", pair[:, :, NOSE].min(axis=1))   # intruder nose to nearest resident point

    # Facing: cosine between a mouse's heading and the direction to the other mouse.
    r_to_i = _unit(centre[:, i] - centre[:, r])
    add("res_facing_int", (heading[:, r] * r_to_i).sum(-1))
    add("int_facing_res", (heading[:, i] * -r_to_i).sum(-1))
    add("heading_alignment", (heading[:, r] * heading[:, i]).sum(-1))

    # Relative motion.
    add("approach_rate", _grad(d_cc))                       # <0: closing in
    add("rel_speed", np.linalg.norm(_grad(centre[:, r]) - _grad(centre[:, i]), axis=-1))
    # Speed component of each mouse toward the other.
    add("res_vel_toward_int", (_grad(centre[:, r]) * r_to_i).sum(-1))
    add("int_vel_toward_res", (_grad(centre[:, i]) * -r_to_i).sum(-1))

    if extra:
        # ---- v2: acceleration (second difference of position, in px/frame^2) ----
        for m, mn in enumerate(MOUSE_NAMES):
            add(f"{mn}_centre_accel", np.linalg.norm(_grad(_grad(centre[:, m])), axis=-1))
            add(f"{mn}_nose_accel", np.linalg.norm(_grad(_grad(kp[:, m, NOSE])), axis=-1))
            add(f"{mn}_centre_speed_rate", _grad(np.linalg.norm(_grad(centre[:, m]), axis=-1)))
            # Body bend: angle between tail->neck and neck->nose; |.| so it is mirror-agnostic.
            a, b = kp[:, m, NECK] - kp[:, m, TAIL], kp[:, m, NOSE] - kp[:, m, NECK]
            add(f"{mn}_bend", np.abs(np.arctan2(a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0], (a * b).sum(-1))))
        # ---- v2: where the OTHER mouse is, in each mouse's own body frame ----
        # forward = along its heading, lateral = |sideways| (behind/beside/ahead
        # is what separates mount, attack from investigation).
        for m, (mn, on) in enumerate((("res", "int"), ("int", "res"))):
            v = centre[:, 1 - m] - centre[:, m]
            h = heading[:, m]
            add(f"{on}_in_{mn}_fwd", (v * h).sum(-1))
            add(f"{on}_in_{mn}_lat", np.abs(h[:, 0] * v[:, 1] - h[:, 1] * v[:, 0]))
        # Signed relative heading (resident-to-intruder), as an angle rather than a cosine.
        hr, hi = heading[:, r], heading[:, i]
        add("heading_diff_abs", np.abs(np.arctan2(hr[:, 0] * hi[:, 1] - hr[:, 1] * hi[:, 0], (hr * hi).sum(-1))))
        # Rates of the distances that matter most, and relative acceleration.
        add("d_nose_nose_rate", _grad(_dist(kp[:, r, NOSE], kp[:, i, NOSE])))
        add("d_min_any_rate", _grad(pair.reshape(len(kp), -1).min(axis=1)))
        add("d_resnose_intcentre_rate", _grad(_dist(kp[:, r, NOSE], centre[:, i])))
        add("approach_accel", _grad(_grad(d_cc)))
        add("rel_speed_rate", _grad(np.linalg.norm(_grad(centre[:, r]) - _grad(centre[:, i]), axis=-1)))
    return np.stack(cols, axis=1), names


# Base features that also get longer-range temporal context in v2: whether the
# animals were closing in before / separating after a frame is what tells
# attack-onset from investigation and bout edges from interiors.
CONTEXT_KEYS = ("d_centre_centre", "d_min_any", "d_resnose_intcentre", "d_intnose_rescentre",
                "res_centre_speed", "int_centre_speed", "res_nose_speed", "rel_speed",
                "res_facing_int", "int_facing_res", "approach_rate")
CONTEXT_SPAN = 30   # frames (1 s) either side
LONG_WINDOW = 91    # ~3 s centered mean/std


def _offset_mean(x: np.ndarray, lo: int, hi: int) -> np.ndarray:
    """Mean of x[t+lo .. t+hi] per column (edge-replicated), lo <= hi."""
    t, w = len(x), hi - lo + 1
    pad_l, pad_r = max(-lo, 0) + max(hi, 0), max(hi, 0) + max(-lo, 0)
    padded = np.pad(x, ((pad_l, pad_r), (0, 0)), mode="edge")
    c = np.concatenate([np.zeros((1, x.shape[1])), np.cumsum(padded, axis=0)])
    start = pad_l + lo
    return (c[start + w:start + w + t] - c[start:start + t]) / w


def _rolling_mean_std(x: np.ndarray, w: int) -> Tuple[np.ndarray, np.ndarray]:
    """Centered rolling mean/std over w frames (edge-replicated), per column."""
    t = len(x)
    left = w // 2
    right = w - 1 - left
    padded = np.pad(x, ((left, right), (0, 0)), mode="edge")
    c1 = np.concatenate([np.zeros((1, x.shape[1])), np.cumsum(padded, axis=0)])
    c2 = np.concatenate([np.zeros((1, x.shape[1])), np.cumsum(padded ** 2, axis=0)])
    s1 = c1[w:w + t] - c1[:t]
    s2 = c2[w:w + t] - c2[:t]
    mean = s1 / w
    var = np.maximum(s2 / w - mean ** 2, 0.0)
    return mean, np.sqrt(var)


def _build_names(base_names: List[str]) -> List[str]:
    names = list(base_names)
    for w in WINDOWS:
        names += [f"{n}_mean{w}" for n in base_names]
        names += [f"{n}_std{w}" for n in base_names]
    return names


DEFAULT_FEATURE_SET = "v2"  # chosen on train-only repeated grouped CV (ml/cv_eval.py): +0.0076 macro-F1 over v1, paired CI excludes 0
FEATURE_SETS = ("v1", "v2a", "v2b", "v2")  # v1 = original 210; v2a = + extra base features, v2b = + long-range context, v2 = both


def _context_names(base_names: List[str]) -> List[str]:
    keys = [n for n in CONTEXT_KEYS if n in base_names]
    return ([f"{n}_past{CONTEXT_SPAN}" for n in keys] + [f"{n}_fut{CONTEXT_SPAN}" for n in keys]
            + [f"{n}_trend{CONTEXT_SPAN}" for n in keys]
            + [f"{n}_mean{LONG_WINDOW}" for n in keys] + [f"{n}_std{LONG_WINDOW}" for n in keys])


# Computed once from a dummy input so names always match the columns produced.
_DUMMY = np.zeros((2, N_MICE, N_KEYPOINTS, 2))


def feature_names(feature_set: str = DEFAULT_FEATURE_SET) -> List[str]:
    if feature_set not in FEATURE_SETS:
        raise ValueError(f"unknown feature_set {feature_set!r}, expected one of {FEATURE_SETS}")
    use_extra, use_ctx = feature_set in ("v2a", "v2"), feature_set in ("v2b", "v2")
    base_names = base_features(_DUMMY, extra=use_extra)[1]
    names = _build_names(base_names)
    return names + (_context_names(base_names) if use_ctx else [])


FEATURE_NAMES: List[str] = feature_names(DEFAULT_FEATURE_SET)


def compute_features(kp: np.ndarray, feature_set: str = DEFAULT_FEATURE_SET) -> np.ndarray:
    """(T, 2, 7, 2) keypoints -> (T, len(feature_names(feature_set))) float32."""
    if feature_set not in FEATURE_SETS:
        raise ValueError(f"unknown feature_set {feature_set!r}, expected one of {FEATURE_SETS}")
    use_extra, use_ctx = feature_set in ("v2a", "v2"), feature_set in ("v2b", "v2")
    base, base_names = base_features(kp, extra=use_extra)
    blocks = [base]
    for w in WINDOWS:
        mean, std = _rolling_mean_std(base, w)
        blocks += [mean, std]
    if use_ctx:
        cols = [base_names.index(n) for n in CONTEXT_KEYS if n in base_names]
        k = base[:, cols]
        past = _offset_mean(k, -CONTEXT_SPAN, -1)
        fut = _offset_mean(k, 1, CONTEXT_SPAN)
        lmean, lstd = _rolling_mean_std(k, LONG_WINDOW)
        blocks += [past, fut, fut - past, lmean, lstd]
    out = np.concatenate(blocks, axis=1).astype(np.float32)
    if not np.isfinite(out).all():
        raise ValueError("non-finite values in features")
    return out
