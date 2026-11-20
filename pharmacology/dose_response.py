"""Dose-response statistics for the yohimbine open-field data (numpy only).

Reads the per-mouse metrics in frontend/src/data/open_field.json and writes
frontend/src/data/dose_response.json. Needs no raw data, so it is reproducible
from the committed JSON:

    python pharmacology/dose_response.py

Design (decided BEFORE looking at richer metrics, to limit forking paths)
 * Mice are independent animals, one per dose (between-subject), n=8 per group.
 * Primary family = 2 metrics x 3 doses vs saline = 6 comparisons:
     - distance_arena_widths  (locomotion)
     - center_pct             (time in arena center)
   `mean_speed_px_per_frame` is distance divided by the number of steps, so it
   is the same signal; it is reported but never tested as a separate finding.
 * Tests are exact permutation tests (C(16,8) = 12,870 relabelings, enumerated,
   not sampled) on the difference in group means, two-sided. With n=8 there is
   no honest asymptotic p-value, and no normality assumption is made.
 * Multiplicity: Holm step-down across the 6 primary comparisons.
 * Effect sizes: Hedges' g (small-sample corrected standardized difference) and
   the raw mean difference, each with a percentile bootstrap 95% CI. With n=8
   per group, bootstrap CIs are optimistic (slightly too narrow); read them as
   a guide to precision, not as exact coverage.
 * Dose trend: Spearman rank correlation of metric with dose over all 32 mice
   (Monte-Carlo permutation p, add-one corrected), Holm-adjusted across the 2
   primary metrics. A trend test only describes monotonic relationships; the
   `shape` field flags metrics whose group means are not monotonic in dose.
 * Power: simulated minimum detectable effect for n=8 vs 8, so a
   non-significant result is not read as "no effect".

These statistics describe THIS dataset (32 mice). They are not a claim about
yohimbine in general.
"""
import itertools
import json
from pathlib import Path
from typing import Dict, List, Sequence

import numpy as np

SEED = 20231120
N_BOOT = 10_000
N_TREND_PERM = 20_000
SALINE = 0.0
PRIMARY = {
    "distance_arena_widths": "Distance traveled (arena widths)",
    "center_pct": "Time in arena center (%)",
}
DERIVED = {"mean_speed_px_per_frame": "Mean speed is distance / steps: the same signal as distance, not tested separately."}
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "src" / "data" / "open_field.json"
DEST = ROOT / "frontend" / "src" / "data" / "dose_response.json"
EXACT_LIMIT = 200_000  # enumerate all relabelings when there are at most this many


# ------------------------------------------------------------ primitives ----
def hedges_g(treated: np.ndarray, control: np.ndarray) -> float:
    """Standardized mean difference (treated - control) with the small-sample
    correction J = 1 - 3 / (4(n1 + n2) - 9)."""
    n1, n2 = len(treated), len(control)
    sp = np.sqrt(((n1 - 1) * treated.var(ddof=1) + (n2 - 1) * control.var(ddof=1)) / (n1 + n2 - 2))
    if sp == 0:
        return 0.0
    return float((treated.mean() - control.mean()) / sp * (1 - 3 / (4 * (n1 + n2) - 9)))


def permutation_p(treated: np.ndarray, control: np.ndarray, rng: np.random.Generator, n_mc: int = 100_000) -> Dict:
    """Two-sided permutation p-value for the difference in means. Exact
    (all relabelings) when feasible, otherwise Monte Carlo with add-one."""
    pooled = np.concatenate([treated, control])
    n, k = len(pooled), len(treated)
    obs = abs(treated.mean() - control.mean())
    total = float(np.prod([(n - i) / (i + 1) for i in range(k)]))  # C(n, k)
    tol = 1e-12 * max(1.0, np.abs(pooled).max())
    if total <= EXACT_LIMIT:
        combos = np.array(list(itertools.combinations(range(n), k)))
        s = pooled[combos].sum(axis=1)
        diff = np.abs(s / k - (pooled.sum() - s) / (n - k))
        return {"p": float((diff >= obs - tol).mean()), "method": "exact", "n_perm": int(len(combos))}
    idx = np.argsort(rng.random((n_mc, n)), axis=1)[:, :k]
    s = pooled[idx].sum(axis=1)
    diff = np.abs(s / k - (pooled.sum() - s) / (n - k))
    return {"p": float((1 + (diff >= obs - tol).sum()) / (1 + n_mc)), "method": "monte-carlo", "n_perm": int(n_mc)}


def bootstrap_ci(treated: np.ndarray, control: np.ndarray, rng: np.random.Generator, n_boot: int = N_BOOT) -> Dict:
    """Percentile 95% CIs for the mean difference and for Hedges' g (resampling
    each group separately)."""
    t = treated[rng.integers(0, len(treated), (n_boot, len(treated)))]
    c = control[rng.integers(0, len(control), (n_boot, len(control)))]
    diff = t.mean(1) - c.mean(1)
    n1, n2 = len(treated), len(control)
    sp = np.sqrt(((n1 - 1) * t.var(1, ddof=1) + (n2 - 1) * c.var(1, ddof=1)) / (n1 + n2 - 2))
    j = 1 - 3 / (4 * (n1 + n2) - 9)
    with np.errstate(divide="ignore", invalid="ignore"):
        g = np.where(sp > 0, diff / sp * j, 0.0)
    lo, hi = np.percentile(diff, [2.5, 97.5])
    glo, ghi = np.percentile(g, [2.5, 97.5])
    return {"mean_diff_ci": [float(lo), float(hi)], "g_ci": [float(glo), float(ghi)]}


def holm(pvals: Sequence[float]) -> List[float]:
    """Holm step-down adjusted p-values (monotone, capped at 1)."""
    p = np.asarray(pvals, dtype=float)
    order = np.argsort(p)
    m = len(p)
    adj = np.empty(m)
    running = 0.0
    for rank, i in enumerate(order):
        running = max(running, (m - rank) * p[i])
        adj[i] = min(1.0, running)
    return [float(x) for x in adj]


def _ranks(x: np.ndarray) -> np.ndarray:
    """Average ranks (ties share the mean rank)."""
    order = np.argsort(x, kind="mergesort")
    ranks = np.empty(len(x))
    ranks[order] = np.arange(len(x), dtype=float)
    for v in np.unique(x):
        m = x == v
        ranks[m] = ranks[m].mean()
    return ranks


def spearman(x: np.ndarray, y: np.ndarray) -> float:
    rx, ry = _ranks(np.asarray(x, float)), _ranks(np.asarray(y, float))
    if rx.std() == 0 or ry.std() == 0:
        return 0.0
    return float(np.corrcoef(rx, ry)[0, 1])


def trend_test(dose: np.ndarray, y: np.ndarray, rng: np.random.Generator, n_perm: int = N_TREND_PERM) -> Dict:
    rho = spearman(dose, y)
    rd = _ranks(np.asarray(dose, float))
    ry = _ranks(np.asarray(y, float))
    perm = np.argsort(rng.random((n_perm, len(y))), axis=1)
    rp = ry[perm]
    rd_c, rp_c = rd - rd.mean(), rp - rp.mean(axis=1, keepdims=True)
    rho_perm = (rp_c * rd_c).sum(1) / np.sqrt((rd_c**2).sum() * (rp_c**2).sum(1))
    p = (1 + (np.abs(rho_perm) >= abs(rho) - 1e-12).sum()) / (1 + n_perm)
    return {"spearman": rho, "p": float(p), "n_perm": int(n_perm)}


def is_monotonic(means: Sequence[float]) -> bool:
    d = np.diff(means)
    return bool((d >= 0).all() or (d <= 0).all())


# ----------------------------------------------------------------- power ----
def minimum_detectable_effect(n_per_group: int, alpha: float, power: float = 0.8, sims: int = 1000,
                              n_perm: int = 999, seed: int = SEED) -> Dict:
    """Smallest standardized effect d (grid step 0.1) a two-sided permutation
    test of means detects with the given power, for normal data with equal
    variance. Monte-Carlo, deterministic for a fixed seed."""
    rng = np.random.default_rng(seed)
    n = 2 * n_per_group
    labels = np.argsort(rng.random((n_perm, n)), axis=1)[:, :n_per_group]
    w = np.zeros((n, n_perm))
    for j in range(n_perm):
        w[labels[j], j] = 1.0 / n_per_group
        w[np.setdiff1d(np.arange(n), labels[j]), j] = -1.0 / n_per_group  # treated mean - control mean
    base = rng.standard_normal((sims, n))
    curve = []
    for d in np.round(np.arange(0.5, 4.01, 0.1), 1):
        x = base.copy()
        x[:, :n_per_group] += d                                 # first group is "treated"
        obs = np.abs(x[:, :n_per_group].mean(1) - x[:, n_per_group:].mean(1))
        perm = np.abs(x @ w)
        p = (1 + (perm >= obs[:, None] - 1e-12).sum(1)) / (1 + n_perm)
        curve.append((float(d), float((p <= alpha).mean())))
    mde = next((d for d, pw in curve if pw >= power), None)
    return {"alpha": alpha, "power": power, "mde_d": mde, "curve": [[d, round(pw, 3)] for d, pw in curve[::5]]}


# ------------------------------------------------------------------ build ---
def analyze(mice: List[Dict]) -> Dict:
    rng = np.random.default_rng(SEED)
    doses = sorted({m["dose_mg_kg"] for m in mice})
    if SALINE not in doses:
        raise ValueError("no saline (0 mg/kg) group to compare against")
    by = {d: [m for m in mice if m["dose_mg_kg"] == d] for d in doses}
    sizes = {d: len(v) for d, v in by.items()}
    if min(sizes.values()) < 2:
        raise ValueError(f"every dose group needs at least 2 mice, got {sizes}")
    dose_all = np.array([m["dose_mg_kg"] for m in mice], dtype=float)

    metrics, flat = {}, []
    for key, label in PRIMARY.items():
        control = np.array([m[key] for m in by[SALINE]], dtype=float)
        per_dose, comps = [], []
        for d in doses:
            v = np.array([m[key] for m in by[d]], dtype=float)
            per_dose.append({"dose_mg_kg": d, "n": int(len(v)), "mean": float(v.mean()), "sd": float(v.std(ddof=1)),
                             "values": [float(x) for x in v]})
            if d == SALINE:
                continue
            perm = permutation_p(v, control, rng)
            comp = {"dose_mg_kg": d, "mean_diff": float(v.mean() - control.mean()), "hedges_g": hedges_g(v, control),
                    "p_perm": perm["p"], "p_method": perm["method"], "n_perm": perm["n_perm"],
                    **bootstrap_ci(v, control, rng)}
            comps.append(comp)
            flat.append(comp)
        y = np.array([m[key] for m in mice], dtype=float)
        metrics[key] = {"label": label, "per_dose": per_dose, "comparisons": comps,
                        "trend": trend_test(dose_all, y, rng),
                        "shape": "monotonic" if is_monotonic([p["mean"] for p in per_dose]) else "non-monotonic"}
    for comp, padj in zip(flat, holm([c["p_perm"] for c in flat])):
        comp["p_holm"] = padj
    for key, tp in zip(metrics, holm([metrics[k]["trend"]["p"] for k in metrics])):
        metrics[key]["trend"]["p_holm"] = tp

    n_g = min(sizes.values())
    family = len(flat)
    power = {"n_per_group": n_g, "assumes": "normal data, equal variance, permutation test of means",
             "single_test": minimum_detectable_effect(n_g, 0.05),
             "whole_family_bonferroni": minimum_detectable_effect(n_g, 0.05 / family)}
    return {
        "_source": "pharmacology/dose_response.py from frontend/src/data/open_field.json; do not edit by hand",
        "scope": ("Statistics describe these 32 mice only (saline, 1, 3 and 6 mg/kg yohimbine, 8 per group). "
                  "They are not a claim about yohimbine in general or about the classifier."),
        "design": {"groups": {str(d): n for d, n in sizes.items()}, "reference": "saline (0 mg/kg)",
                   "family": f"{family} comparisons = {len(PRIMARY)} primary metrics x {len(doses) - 1} doses vs saline",
                   "test": "exact two-sided permutation test on the difference in means",
                   "multiplicity": "Holm step-down across the family",
                   "effect_size": "Hedges' g and raw mean difference, percentile bootstrap 95% CI "
                                  f"({N_BOOT} resamples; optimistic at n=8 per group)",
                   "trend": f"Spearman rho vs dose over all mice, Monte-Carlo permutation p ({N_TREND_PERM} perms), "
                            "Holm across the primary metrics"},
        "derived_not_tested": DERIVED,
        "metrics": metrics,
        "power": power,
    }


def main() -> None:
    mice = json.loads(SRC.read_text())["mice"]
    out = analyze(mice)
    DEST.write_text(json.dumps(out, indent=1, allow_nan=False) + "\n")
    print(f"wrote {DEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
