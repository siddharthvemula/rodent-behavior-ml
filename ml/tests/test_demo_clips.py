"""export_demo_clips.py and the committed frontend/src/data/demo_clips.json.

The helpers are tested on synthetic recordings. The committed file is checked for
internal consistency, for staleness against the shipped model (a sha256 of
model.joblib, so this works in CI without the gitignored dataset), and, when the
local dataset exists, against the dataset's own labels.
"""
import hashlib
import json
import re
from pathlib import Path

import numpy as np
import pytest

import export_demo_clips as E
import model as M
import preprocess as P

DATA = E.DEFAULT_OUT


def rec(rid, T=400, seed=0):
    r = np.random.default_rng(seed)
    kp = np.cumsum(r.normal(0, 2, (T, 2, 7, 2)), axis=0).astype(np.float32) + 300
    labels = np.repeat(r.integers(0, 4, T // 40), 40).astype(np.int8)
    return P.Recording(rid, kp, np.ones((T, 2, 7), dtype=np.float32), labels)


# ---------------------------------------------------------------- provenance
def test_find_slice_matches_an_exact_slice_even_after_the_export_rounding():
    recs = [rec("a", seed=1), rec("b", seed=2)]
    clip = np.round(recs[1].keypoints[100:250], 1)
    assert E.find_slice(clip, recs) == [(1, 100)]


def test_find_slice_rejects_a_perturbed_or_unrelated_clip():
    recs = [rec("a", seed=1)]
    assert E.find_slice(recs[0].keypoints[10:60] + 0.5, recs) == []
    assert E.find_slice(rec("z", seed=9).keypoints[:50], recs) == []


def test_locate_in_test_accepts_a_unique_test_slice():
    train, test = [rec("tr", seed=1)], [rec("t0", seed=2), rec("t1", seed=3)]
    assert E.locate_in_test(np.round(test[1].keypoints[0:120], 1), train, test) == (1, 0)


def test_locate_in_test_refuses_train_unknown_and_ambiguous_clips():
    train, test = [rec("tr", seed=1)], [rec("t0", seed=2)]
    with pytest.raises(E.SourceError, match="TRAIN"):
        E.locate_in_test(train[0].keypoints[0:100], train, test)
    with pytest.raises(E.SourceError, match="not a verbatim slice"):
        E.locate_in_test(rec("z", seed=9).keypoints[:100], train, test)
    twin = [rec("t0", seed=2), rec("t0-copy", seed=2)]
    with pytest.raises(E.SourceError, match="ambiguous"):
        E.locate_in_test(twin[0].keypoints[0:100], train, twin)


def test_a_clip_that_is_in_both_splits_is_refused_not_trusted():
    shared = rec("s", seed=4)
    with pytest.raises(E.SourceError, match="TRAIN"):
        E.locate_in_test(shared.keypoints[0:100], [shared], [shared])


# ----------------------------------------------------------------- encoding
def test_label_segments_round_trip_and_contiguity():
    labels = np.array([3, 3, 3, 1, 1, 0, 0, 0, 0, 3], dtype=np.int8)
    segs = E.label_segments(labels, 30.0)
    assert [s["behavior_label"] for s in segs] == ["other", "investigation", "attack", "other"]
    assert segs[0]["start_time"] == 0 and segs[-1]["end_time"] == pytest.approx(10 / 30, abs=1e-3)
    for a, b in zip(segs, segs[1:]):
        assert a["end_time"] == b["start_time"]
    frames = np.zeros(len(labels), dtype=int)
    for s in segs:
        frames[round(s["start_time"] * 30):round(s["end_time"] * 30)] = E.LABELS.index(s["behavior_label"])
    assert np.array_equal(frames, labels)
    assert E.label_segments(np.array([], dtype=np.int8)) == []


def test_agreement_known_confusion_and_absent_classes_have_no_f1():
    truth = np.array([1, 1, 1, 1, 3, 3], dtype=np.int8)         # investigation x4, other x2
    pred = np.array([1, 1, 1, 3, 3, 3], dtype=np.int8)
    a = E.agreement(truth, pred)
    assert a["frames"] == 6 and a["accuracy"] == pytest.approx(5 / 6, abs=1e-4)
    assert a["per_class_f1"]["attack"] is None and a["per_class_f1"]["mount"] is None
    assert a["per_class_f1"]["investigation"] == pytest.approx(2 * 3 / (2 * 3 + 0 + 1), abs=1e-3)
    assert a["confusion_rows_annotated_cols_predicted"][1] == [0, 3, 0, 1]
    assert a["time_share_annotated"]["investigation"] == pytest.approx(4 / 6, abs=1e-3)
    assert sum(a["time_share_predicted"].values()) == pytest.approx(1.0, abs=1e-3)
    assert E.agreement(truth, truth)["accuracy"] == 1.0


# ------------------------------------------------------- the committed file
@pytest.fixture(scope="module")
def doc():
    return json.loads(DATA.read_text())


def test_file_is_small_and_has_exactly_two_clips(doc):
    assert DATA.stat().st_size < 40_000
    assert [(c["id"], c["label"]) for c in doc["clips"]] == [("clip_a", "Clip A"), ("clip_b", "Clip B")]


def test_no_two_group_labels_anywhere_in_the_file():
    """The demo calls these Clip A / Clip B. The words that imply an experiment must not appear at all."""
    assert not re.search(r"control|treat", DATA.read_text(), re.IGNORECASE)


def test_attribution_is_complete(doc):
    a = doc["attribution"]
    assert a["license"] == "CC BY 4.0" and a["license_url"] == "https://creativecommons.org/licenses/by/4.0/"
    assert a["url"].startswith("https://data.caltech.edu/records/")
    assert "Sun et al." in a["citation"] and "Mouse Dyadic Social Interactions" in a["citation"]
    assert "first 100 seconds" in a["changes"] and "not part of the dataset" in a["changes"]   # CC BY: say what was changed


def test_clips_are_test_split_slices_with_contiguous_segments(doc):
    for c in doc["clips"]:
        s = c["source"]
        assert s["split"] == "test" and s["recording"].startswith("task1/test/")
        assert s["frames"] == 3000 and s["seconds"] == pytest.approx(100.0) and s["frame_rate"] == 30.0
        for name, tol in (("annotations", 0.002), ("predictions", 0.011)):
            segs = c[name]
            assert segs[0]["start_time"] == 0
            assert segs[-1]["end_time"] == pytest.approx(s["seconds"], abs=tol)
            for a, b in zip(segs, segs[1:]):
                assert b["start_time"] == pytest.approx(a["end_time"], abs=tol)
            assert all(x["behavior_label"] in doc["behaviors"] and x["end_time"] > x["start_time"] for x in segs)
        assert all(0 <= p["confidence"] <= 1 for p in c["predictions"])


def test_agreement_matches_its_own_confusion_matrix(doc):
    for c in doc["clips"]:
        a = c["agreement"]
        cm = np.array(a["confusion_rows_annotated_cols_predicted"])
        assert cm.shape == (4, 4) and cm.sum() == a["frames"] == c["source"]["frames"]
        assert a["accuracy"] == pytest.approx(np.trace(cm) / cm.sum(), abs=1e-4)
        assert sum(a["time_share_annotated"].values()) == pytest.approx(1.0, abs=1e-3)
        absent = [k for k, v in a["time_share_annotated"].items() if v == 0]
        assert all(a["per_class_f1"][k] is None for k in absent)


def test_predicted_time_shares_agree_with_the_prediction_segments(doc):
    for c in doc["clips"]:
        for label in doc["behaviors"]:
            seg = sum(s["end_time"] - s["start_time"] for s in c["predictions"] if s["behavior_label"] == label)
            assert c["agreement"]["time_share_predicted"][label] == pytest.approx(seg / c["source"]["seconds"], abs=0.01)


def test_compare_uses_neutral_keys_and_is_consistent(doc):
    cmp_, iv = doc["compare"], doc["compare_intervals"]
    assert set(cmp_) == {"a", "b", "difference"} and set(iv) == {"level", "a", "b", "difference"} and iv["level"] == 0.95
    for k in doc["behaviors"]:
        assert cmp_["difference"][k] == pytest.approx(cmp_["b"][k] - cmp_["a"][k], abs=0.011)
        for who in ("a", "b", "difference"):
            lo, hi = iv[who][k]
            assert lo <= hi
    for who, clip in (("a", doc["clips"][0]), ("b", doc["clips"][1])):
        assert sum(cmp_[who].values()) == pytest.approx(1.0, abs=0.03)
        for k in doc["behaviors"]:
            assert cmp_[who][k] == pytest.approx(clip["agreement"]["time_share_predicted"][k], abs=0.011)


def test_predictions_are_not_stale_against_the_shipped_model(doc):
    """If model.joblib is retrained, these precomputed predictions are wrong until re-exported:
    python ml/export_demo_clips.py <clip A> <clip B>"""
    m = doc["model"]
    assert m["sha256"] == hashlib.sha256(M.MODEL_PATH.read_bytes()).hexdigest()
    assert m["n_features"] == len(__import__("features").FEATURE_NAMES)


# ------------------------------------------------- against the real dataset
TEST_NPZ = E.PROCESSED / "calms21_task1_test.npz"


@pytest.mark.skipif(not TEST_NPZ.exists(), reason="needs the local CalMS21 test split (data/processed, gitignored)")
def test_annotations_equal_the_datasets_own_labels(doc):
    test = {r.id: r for r in P.load_recordings(TEST_NPZ)}
    for c in doc["clips"]:
        s = c["source"]
        labels = test[s["recording"]].labels[s["start_frame"]:s["start_frame"] + s["frames"]]
        assert E.label_segments(labels, s["frame_rate"]) == c["annotations"]
