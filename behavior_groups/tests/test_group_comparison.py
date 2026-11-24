import json
from math import comb

import numpy as np
import pytest

import group_comparison as gc
import group_metrics as gm


def synthetic(effect=0.0, sizes=(8, 14, 14, 14), seed=0, shifted=()):
    rng = np.random.default_rng(seed)
    videos = []
    for g, n in zip(gm.GROUP_ORDER, sizes):
        for i in range(n):
            row = {"video_id": f"{g}{i}", "group": g, "window_sec": 570.0 + i, "time_shift_frames": -20 if (g, i) in shifted else None}
            for k in gm.PRIMARY:
                row[k] = float(rng.gamma(2.0, 2.0) + (effect if g == "stress" and k == "attack_time_pct" else 0))
            videos.append(row)
    return {"dataset": {"name": "synthetic"}, "parameters": {"primary_metrics": list(gm.PRIMARY)}, "videos": videos}


@pytest.fixture(scope="module")
def null_data():
    return synthetic(seed=3)


@pytest.fixture(scope="module")
def null_out(null_data):
    return gc.analyze(null_data)


def test_planned_family_is_36_and_locked():
    assert gc.FAMILY_SIZE == 36 == len(gm.PRIMARY) * len(gc.CONTRASTS)
    assert gc.REFERENCE == "naive" and gc.CONTRASTS == ("stress", "isolation", "mated")


def test_eight_vs_fourteen_is_exactly_enumerated(null_out):
    out = null_out
    comps = [c for m in out["metrics"].values() for c in m["comparisons"]]
    assert len(comps) == 36
    assert all(c["p_method"] == "exact" and c["n_perm"] == comb(22, 8) == 319770 for c in comps)
    assert all(0 < c["p_perm"] <= 1 and c["p_holm"] >= c["p_perm"] for c in comps)


def test_holm_across_the_whole_family_and_null_is_not_significant(null_out):
    out = null_out
    comps = [c for m in out["metrics"].values() for c in m["comparisons"]]
    order = np.argsort([c["p_perm"] for c in comps])
    adj = [comps[i]["p_holm"] for i in order]
    assert adj == sorted(adj) and max(adj) <= 1
    assert sum(c["p_holm"] < gc.ALPHA for c in comps) == 0  # pure noise: nothing survives 36-fold correction


def test_a_planted_effect_is_found_and_has_the_right_sign():
    out = gc.analyze(synthetic(effect=40.0))
    c = out["metrics"]["attack_time_pct"]["comparisons"][0]
    assert c["group"] == "stress" and c["hedges_g"] > 3 and c["p_holm"] < 0.05 and c["mean_diff"] > 30
    assert c["mean_diff_ci"][0] < c["mean_diff"] < c["mean_diff_ci"][1]


def test_per_group_values_are_the_inputs_not_summaries_of_something_else(null_data, null_out):
    data, out = null_data, null_out
    got = out["metrics"]["sniff_bouts_per_min"]["groups"]["naive"]
    want = [v["sniff_bouts_per_min"] for v in data["videos"] if v["group"] == "naive"]
    assert got["values"] == want and got["n"] == 8


def test_sensitivity_without_shifted_videos_and_its_refusal_when_a_group_is_too_small():
    shifted = {("stress", i) for i in range(5)} | {("naive", 0)}
    out = gc.analyze(synthetic(shifted=shifted))
    ts = out["time_shift"]
    assert ts["videos_shifted_by_group"]["stress"] == 5 and ts["unshifted_by_group"]["naive"] == 7
    assert ts["sensitivity_without_shifted"] is not None
    # every naive video shifted -> no honest comparison is possible, and it says so rather than inventing one
    out = gc.analyze(synthetic(shifted={("naive", i) for i in range(8)}))
    assert out["time_shift"]["sensitivity_without_shifted"] is None


def test_rejects_a_different_metric_list_and_tiny_groups():
    bad = synthetic()
    bad["parameters"]["primary_metrics"] = bad["parameters"]["primary_metrics"][:-1]
    with pytest.raises(ValueError, match="different primary-metric list"):
        gc.analyze(bad)
    with pytest.raises(ValueError, match="at least 2"):
        gc.analyze(synthetic(sizes=(1, 14, 14, 14)))


def test_output_is_deterministic_and_json_safe(null_data, null_out):
    assert json.dumps(null_out, allow_nan=False) == json.dumps(gc.analyze(null_data), allow_nan=False)


def test_label_helper():
    assert gc.label("sniffgenital_bouts_per_min") == "sniffgenital: Bouts per minute"
    assert gc.label("attack_time_pct").startswith("attack: Time in behavior")
