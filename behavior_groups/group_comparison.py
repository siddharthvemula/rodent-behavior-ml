"""Group comparison statistics for InvincibleJellyfish (phase 2 of 2; numpy only).

Reads frontend/src/data/jellyfish_videos.json (written by group_metrics.py) and writes
frontend/src/data/group_comparison.json. Needs no raw data:

    python behavior_groups/group_comparison.py

This is a DESCRIPTIVE comparison of observed group differences. It is not a causal estimate: the
dataset documents no randomization, the groups were not necessarily recorded in the same sessions,
and recordings may not be independent across the archive (see `caveats`).

Design (fixed in code BEFORE any group comparison was looked at; mirrors pharmacology/dose_response.py)
 * One recording = one resident mouse, analysed as independent units (mouse1_id is unique per
   recording). n = 8 naive, 14 each stress / isolation / mated.
 * Reference group = naive. Planned contrasts = stress, isolation, mated, each vs naive.
 * Primary family = 12 metrics (group_metrics.PRIMARY: time-in-behavior and bout frequency for six
   behaviors) x 3 contrasts = 36 comparisons. The family size is asserted below so it cannot drift.
 * Tests: exact two-sided permutation tests on the difference in group means. 8 vs 14 has
   C(22,8) = 319,770 relabelings, all enumerated (never sampled), no distributional assumption.
 * Multiplicity: Holm step-down across all 36.
 * Effect sizes: Hedges' g and the raw mean difference with percentile bootstrap 95% CIs
   (optimistic at these sizes: read them as a guide to precision).
 * Power: simulated minimum detectable effect for 8 vs 8 (the naive group's n; conservative for 8
   vs 14), at the single-test alpha and at the Bonferroni alpha for the whole family.
 * Not planned, so exploratory (effect sizes and raw p only, no adjustment): contrasts between the
   three non-naive groups (14 vs 14 has ~40 million relabelings, so these p-values are Monte Carlo,
   100,000 permutations, add-one corrected, and labelled `monte-carlo`); the same comparisons
   without the videos whose bouts the dataset time-shifted.
"""
import json
import sys
from pathlib import Path
from typing import Dict, List

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pharmacology"))
from dose_response import bootstrap_ci, hedges_g, holm, minimum_detectable_effect, permutation_p  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from group_metrics import BEHAVIORS, GROUP_ORDER, METRIC_KINDS, PRIMARY  # noqa: E402

SEED = 20261124
REFERENCE = "naive"
CONTRASTS = ("stress", "isolation", "mated")
FAMILY_SIZE = 36
EXACT_LIMIT = 400_000  # enough to enumerate 8 vs 14
ALPHA = 0.05
N_BOOT = 10_000
MIN_GROUP_FOR_SENSITIVITY = 3
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src" / "data" / "jellyfish_videos.json"
DEST = ROOT / "frontend" / "src" / "data" / "group_comparison.json"

assert len(PRIMARY) * len(CONTRASTS) == FAMILY_SIZE, "the planned family changed: update FAMILY_SIZE deliberately"
assert REFERENCE == GROUP_ORDER[0] and CONTRASTS == GROUP_ORDER[1:]


def label(key: str) -> str:
    behavior, kind = key.split("_", 1)  # behavior names contain no underscore
    return f"{behavior}: {METRIC_KINDS[kind]}"


def _values(videos: List[Dict], group: str, key: str) -> np.ndarray:
    return np.array([v[key] for v in videos if v["group"] == group], dtype=float)


def _summary(v: np.ndarray) -> Dict:
    return {"n": int(len(v)), "mean": float(v.mean()), "sd": float(v.std(ddof=1)), "median": float(np.median(v)),
            "n_zero": int((v == 0).sum()), "values": [float(x) for x in v]}


def _compare(t: np.ndarray, c: np.ndarray, rng: np.random.Generator, exact: bool = True) -> Dict:
    perm = permutation_p(t, c, rng, exact_limit=EXACT_LIMIT)
    if exact and perm["method"] != "exact":
        raise ValueError("permutation test was not enumerated; the design promises exact p-values")
    return {"mean_diff": float(t.mean() - c.mean()), "hedges_g": hedges_g(t, c), "p_perm": perm["p"],
            "p_method": perm["method"], "n_perm": perm["n_perm"], **bootstrap_ci(t, c, rng, N_BOOT)}


def analyze(data: Dict) -> Dict:
    videos = data["videos"]
    prm = data["parameters"]
    if tuple(prm["primary_metrics"]) != tuple(PRIMARY):
        raise ValueError("jellyfish_videos.json was built with a different primary-metric list than group_metrics.PRIMARY")
    sizes = {g: sum(v["group"] == g for v in videos) for g in GROUP_ORDER}
    if min(sizes.values()) < 2:
        raise ValueError(f"every group needs at least 2 recordings, got {sizes}")
    rng = np.random.default_rng(SEED)

    metrics, flat = {}, []
    for key in PRIMARY:
        ref = _values(videos, REFERENCE, key)
        groups = {g: _summary(_values(videos, g, key)) for g in GROUP_ORDER}
        comps = []
        for g in CONTRASTS:
            comp = {"group": g, **_compare(_values(videos, g, key), ref, rng)}
            comps.append(comp)
            flat.append(comp)
        behavior, kind = key.split("_", 1)
        metrics[key] = {"label": label(key), "behavior": behavior, "kind": kind,
                        "groups": groups, "comparisons": comps}
    if len(flat) != FAMILY_SIZE:
        raise ValueError(f"family has {len(flat)} comparisons, planned {FAMILY_SIZE}")
    for comp, padj in zip(flat, holm([c["p_perm"] for c in flat])):
        comp["p_holm"] = padj

    # Exploratory 1: non-naive groups against each other.
    pairs = [(a, b) for i, a in enumerate(CONTRASTS) for b in CONTRASTS[i + 1:]]
    between = {key: [{"a": a, "b": b, **_compare(_values(videos, a, key), _values(videos, b, key), rng, exact=False)} for a, b in pairs]
               for key in PRIMARY}

    # Exploratory 2: the dataset time-shifted the bouts of some videos (see caveats). How do the planned
    # comparisons look without them?
    shifted = {g: sum(1 for v in videos if v["group"] == g and v["time_shift_frames"] is not None) for g in GROUP_ORDER}
    unshifted = [v for v in videos if v["time_shift_frames"] is None]
    un_sizes = {g: sum(v["group"] == g for v in unshifted) for g in GROUP_ORDER}
    sensitivity = None
    if min(un_sizes.values()) >= MIN_GROUP_FOR_SENSITIVITY:
        sensitivity = {key: [{"group": g, **_compare(_values(unshifted, g, key), _values(unshifted, REFERENCE, key), rng, exact=False)}
                             for g in CONTRASTS] for key in PRIMARY}

    n_ref = sizes[REFERENCE]
    power = {"n_per_group": n_ref, "assumes": "normal data, equal variance, permutation test of means, 8 vs 8 (conservative for 8 vs 14)",
             "single_test": minimum_detectable_effect(n_ref, ALPHA),
             "whole_family_bonferroni": minimum_detectable_effect(n_ref, ALPHA / FAMILY_SIZE)}
    return {
        "_source": "behavior_groups/group_comparison.py from frontend/src/data/jellyfish_videos.json; do not edit by hand",
        "dataset": data["dataset"],
        "window_minutes_range": [round(min(v["window_sec"] for v in videos) / 60, 1), round(max(v["window_sec"] for v in videos) / 60, 1)],
        "scope": ("Statistics describe these 50 recordings of one lab only (naive 8, stress 14, social isolation 14, mated 14). "
                  "They describe observed group differences, not a validated causal effect of any manipulation, and say nothing "
                  "about the behavior classifier."),
        "design": {
            "groups": sizes, "reference": REFERENCE, "contrasts": list(CONTRASTS),
            "family": f"{FAMILY_SIZE} comparisons = {len(PRIMARY)} metrics x {len(CONTRASTS)} groups vs naive, "
                      "fixed in group_metrics.PRIMARY and group_comparison.py before any group comparison was looked at",
            "behaviors": list(BEHAVIORS),
            "test": "exact two-sided permutation test on the difference in means (all relabelings enumerated)",
            "multiplicity": f"Holm step-down across all {FAMILY_SIZE}",
            "effect_size": f"Hedges' g and raw mean difference, percentile bootstrap 95% CI ({N_BOOT} resamples; optimistic at these sizes)",
            "alpha": ALPHA,
            "exploratory": "contrasts between the three non-naive groups, and the planned comparisons without time-shifted videos: effect sizes and raw p only",
        },
        "metrics": metrics,
        "between_groups_exploratory": {"pairs": [list(p) for p in pairs], "metrics": between},
        "time_shift": {"videos_shifted_by_group": shifted, "videos_by_group": sizes,
                       "unshifted_by_group": un_sizes,
                       "offsets_frames": sorted(v["time_shift_frames"] for v in videos if v["time_shift_frames"] is not None),
                       "sensitivity_without_shifted": sensitivity},
        "power": power,
    }


def main() -> None:
    out = analyze(json.loads(SRC.read_text()))
    DEST.write_text(json.dumps(out, indent=1, allow_nan=False) + "\n")
    print(f"wrote {DEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
