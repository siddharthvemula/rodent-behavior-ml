"""Decoders in model.py (viterbi, min-bout filter, per-class smoothing) and the
CV harness helpers in cv_eval.py. Pure numpy, no model file needed."""
import itertools

import numpy as np
import pytest

import cv_eval as C
import model as M


def _noisy(seed=0, runs=(100, 80, 100, 60), classes=(0, 1, 0, 2)):
    rng = np.random.default_rng(seed)
    y = np.repeat(classes, runs)
    p = np.full((len(y), 4), 0.1)
    p[np.arange(len(y)), y] = 0.7
    p = np.clip(p + rng.normal(0, 0.25, p.shape), 0.01, None)
    return y, p / p.sum(1, keepdims=True)


def test_viterbi_zero_penalty_is_argmax():
    _, p = _noisy()
    assert np.array_equal(M.viterbi_decode(p, 0.0), p.argmax(1))


def test_viterbi_is_optimal_on_small_cases():
    rng = np.random.default_rng(1)
    for _ in range(10):
        q, lam = rng.dirichlet(np.ones(4) * 0.7, size=6), rng.uniform(0.1, 3)

        def score(c):
            return (sum(np.log(np.clip(q[i, c[i]], 1e-4, 1)) for i in range(6))
                    - lam * sum(c[i] != c[i + 1] for i in range(5)))

        best = max(itertools.product(range(4), repeat=6), key=score)
        assert abs(score(best) - score(M.viterbi_decode(q, lam).tolist())) < 1e-9


def test_viterbi_removes_flicker_and_handles_edges():
    y, p = _noisy()
    assert (M.viterbi_decode(p, 3.0) != y).mean() < (p.argmax(1) != y).mean()
    assert M.viterbi_decode(np.zeros((0, 4)), 2.0).shape == (0,)
    assert M.viterbi_decode(p[:1], 2.0).shape == (1,)


def test_min_bout_filter_merges_short_runs_only():
    y, p = _noisy()
    out = M.min_bout_filter(p.argmax(1), p, 15)
    assert (out != y).mean() < (p.argmax(1) != y).mean()
    runs = np.diff(np.flatnonzero(np.r_[1, np.diff(out) != 0, 1]))
    assert len(runs) == 1 or runs.min() >= 15
    lab = np.array([0] * 30 + [1] * 30)
    assert np.array_equal(M.min_bout_filter(lab, np.eye(4)[lab], 15), lab)  # nothing short: untouched
    assert np.array_equal(M.min_bout_filter(lab, np.eye(4)[lab], 1), lab)


def test_per_class_smoothing_equal_windows_matches_global():
    _, p = _noisy()
    assert np.allclose(M.smooth_probs_per_class(p, (9, 9, 9, 9)), M.smooth_probs(p, 9))


def test_confusion_and_f1_helpers():
    y = np.array([0, 0, 1, 1, 2, 3, 3, 3])
    cm = C.confusion(y, y)
    assert cm.sum() == len(y) and np.array_equal(np.diag(cm), [2, 2, 1, 3])
    assert np.allclose(C.f1_from_confusion(cm), 1.0)
    pred = y.copy(); pred[0] = 1
    f1 = C.f1_from_confusion(C.confusion(y, pred))
    assert f1[0] == pytest.approx(2 * 1 / (2 * 1 + 0 + 1))  # tp=1, fp=0, fn=1


def test_folds_are_recording_level_and_cover_everything():
    for rep in range(3):
        folds = C.make_folds(70, 5, rep)
        assert sorted(np.concatenate(folds).tolist()) == list(range(70))
    assert not np.array_equal(C.make_folds(70, 5, 0)[0], C.make_folds(70, 5, 1)[0])
    assert all(np.array_equal(a, b) for a, b in zip(C.make_folds(70, 5, 0), C.make_folds(70, 5, 0)))


def test_bootstrap_paired_identical_is_zero():
    rng = np.random.default_rng(0)
    cms = rng.integers(1, 50, size=(2, 12, 4, 4))
    ci_a, ci_d = C.bootstrap_ci(cms, cms, n_boot=50)
    assert ci_d == [0.0, 0.0] and ci_a[0] <= C.macro_f1_of(cms) <= ci_a[1]
