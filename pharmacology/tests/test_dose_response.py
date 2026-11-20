import json

import numpy as np
import pytest

import dose_response as dr


def rng(seed=0):
    return np.random.default_rng(seed)


def test_hedges_g_known_value():
    # means 4 vs 3, both variances 4 -> pooled sd 2, d = 0.5, J = 1 - 3/(4*6-9) = 0.8
    assert dr.hedges_g(np.array([2.0, 4.0, 6.0]), np.array([1.0, 3.0, 5.0])) == pytest.approx(0.4)


def test_hedges_g_zero_variance_is_zero_not_nan():
    assert dr.hedges_g(np.ones(4), np.ones(4)) == 0.0


def test_exact_permutation_p_known_value():
    # n=6, k=3 -> 20 relabelings; only the observed split and its mirror are as extreme -> p = 2/20
    r = dr.permutation_p(np.array([10.0, 11.0, 12.0]), np.array([1.0, 2.0, 3.0]), rng())
    assert r["method"] == "exact" and r["n_perm"] == 20 and r["p"] == pytest.approx(0.1)


def test_permutation_p_identical_groups_is_one_and_in_unit_interval():
    r = dr.permutation_p(np.array([1.0, 2.0, 3.0]), np.array([1.0, 2.0, 3.0]), rng())
    assert r["p"] == 1.0
    assert 0 < dr.permutation_p(rng(1).normal(size=8), rng(2).normal(size=8), rng())["p"] <= 1


def test_permutation_p_eight_vs_eight_is_exact_enumeration():
    r = dr.permutation_p(np.arange(8, dtype=float) + 100, np.arange(8, dtype=float), rng())
    assert r["method"] == "exact" and r["n_perm"] == 12870 and r["p"] == pytest.approx(2 / 12870)


def test_permutation_p_falls_back_to_monte_carlo_for_large_groups():
    r = dr.permutation_p(rng(1).normal(size=40), rng(2).normal(size=40), rng(), n_mc=2000)
    assert r["method"] == "monte-carlo" and 0 < r["p"] <= 1


def test_holm_known_values_and_properties():
    assert dr.holm([0.01, 0.04, 0.03]) == pytest.approx([0.03, 0.06, 0.06])
    p = [0.2, 0.001, 0.04, 0.5]
    adj = dr.holm(p)
    assert all(a >= b for a, b in zip(adj, p)) and max(adj) <= 1.0
    order = np.argsort(p)
    assert list(np.array(adj)[order]) == sorted(adj)          # monotone in raw p
    assert dr.holm([0.9, 0.8]) == [1.0, 1.0]                   # 2*0.8 = 1.6 is capped at 1


def test_spearman_handles_ties_and_direction():
    assert dr.spearman(np.array([0, 0, 1, 1, 3, 3.0]), np.arange(6.0)) > 0.9
    assert dr.spearman(np.arange(6.0), np.arange(6.0)[::-1]) == pytest.approx(-1.0)
    assert dr.spearman(np.array([0.0, 0, 1, 1]), np.array([1.0, 2, 3, 4])) == pytest.approx(0.894427, abs=1e-5)
    assert dr.spearman(np.ones(5), np.arange(5.0)) == 0.0


def test_trend_test_detects_trend_and_not_noise():
    dose = np.repeat([0.0, 1, 3, 6], 8)
    clear = dr.trend_test(dose, dose * 5 + rng(0).normal(size=32), rng(0), n_perm=4000)
    noise = dr.trend_test(dose, rng(5).normal(size=32), rng(0), n_perm=4000)
    assert clear["spearman"] > 0.9 and clear["p"] < 0.01
    assert noise["p"] > 0.05
    assert dr.trend_test(dose, dose, rng(0), n_perm=500)["p"] >= 1 / 501   # add-one: never exactly 0


def test_is_monotonic():
    assert dr.is_monotonic([1, 2, 3]) and dr.is_monotonic([3, 2, 1]) and dr.is_monotonic([2, 2, 2])
    assert not dr.is_monotonic([20.9, 28.0, 27.2, 21.1])


def test_bootstrap_ci_brackets_estimate_and_is_deterministic():
    t, c = rng(1).normal(5, 1, 8), rng(2).normal(0, 1, 8)
    a = dr.bootstrap_ci(t, c, rng(9), n_boot=2000)
    b = dr.bootstrap_ci(t, c, rng(9), n_boot=2000)
    assert a == b
    assert a["mean_diff_ci"][0] < t.mean() - c.mean() < a["mean_diff_ci"][1]
    assert a["g_ci"][0] < dr.hedges_g(t, c) < a["g_ci"][1]


def test_minimum_detectable_effect_behaves_sensibly():
    base = dr.minimum_detectable_effect(8, 0.05, sims=400)
    assert 1.0 <= base["mde_d"] <= 2.5
    assert dr.minimum_detectable_effect(16, 0.05, sims=400)["mde_d"] < base["mde_d"]       # more mice -> smaller
    assert dr.minimum_detectable_effect(8, 0.05 / 6, sims=400)["mde_d"] > base["mde_d"]    # stricter alpha -> larger
    powers = [pw for _, pw in base["curve"]]
    assert powers == sorted(powers)


def _mice(effect=0.0, n=8, seed=0):
    r = np.random.default_rng(seed)
    out = []
    for d in (0.0, 1.0, 3.0, 6.0):
        for i in range(n):
            out.append({"id": f"{d}-{i}", "dose_mg_kg": d,
                        "distance_arena_widths": float(300 - effect * d + r.normal(0, 20)),
                        "center_pct": float(20 + r.normal(0, 4)),
                        "mean_speed_px_per_frame": 3.0})
    return out


def test_analyze_structure_holm_and_determinism():
    out = dr.analyze(_mice(effect=30))
    assert set(out["metrics"]) == set(dr.PRIMARY)
    comps = [c for m in out["metrics"].values() for c in m["comparisons"]]
    assert len(comps) == 6 and all(c["p_holm"] >= c["p_perm"] for c in comps)
    assert all(c["p_method"] == "exact" for c in comps)
    dist = out["metrics"]["distance_arena_widths"]
    assert dist["comparisons"][-1]["p_holm"] < 0.01 and dist["trend"]["spearman"] < -0.8
    assert "mean_speed_px_per_frame" in out["derived_not_tested"]
    assert json.dumps(out) == json.dumps(dr.analyze(_mice(effect=30)))
    json.dumps(out, allow_nan=False)    # no NaN/inf anywhere


def test_analyze_null_data_rarely_significant():
    out = dr.analyze(_mice(effect=0.0, seed=3))
    assert min(c["p_holm"] for m in out["metrics"].values() for c in m["comparisons"]) > 0.05


def test_analyze_rejects_bad_input():
    with pytest.raises(ValueError, match="saline"):
        dr.analyze([m for m in _mice() if m["dose_mg_kg"] != 0.0])
    with pytest.raises(ValueError, match="at least 2"):
        dr.analyze([m for m in _mice() if not (m["dose_mg_kg"] == 3.0 and not m["id"].endswith("-0"))])


def _close(a, b, path=""):
    if isinstance(a, dict):
        assert a.keys() == b.keys(), path
        for k in a:
            _close(a[k], b[k], f"{path}/{k}")
    elif isinstance(a, list):
        assert len(a) == len(b), path
        for i, (x, y) in enumerate(zip(a, b)):
            _close(x, y, f"{path}[{i}]")
    elif isinstance(a, float):
        assert a == pytest.approx(b, rel=1e-6, abs=1e-9), path
    else:
        assert a == b, path


def test_committed_json_is_not_stale():
    """frontend/src/data/dose_response.json must be what dose_response.py produces
    from open_field.json. Fix with: python pharmacology/dose_response.py"""
    mice = json.loads(dr.SRC.read_text())["mice"]
    _close(json.loads(dr.DEST.read_text()), json.loads(json.dumps(dr.analyze(mice))))
