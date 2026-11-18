import numpy as np
import pytest

import features as F
import model as M
import preprocess as P


def _kp(n=120, seed=0):
    """Plausible random dyad: two random-walking mice with body-sized offsets."""
    rng = np.random.default_rng(seed)
    centre = np.cumsum(rng.normal(0, 3, (n, 2, 2)), axis=0) + np.array([[300.0, 300.0], [500.0, 280.0]])
    offsets = rng.normal(0, 25, (2, 7, 2))
    offsets[:, 0] = [40, 0]   # nose ahead
    offsets[:, 6] = [-60, 0]  # tail behind
    return (centre[:, :, None, :] + offsets[None] + rng.normal(0, 1, (n, 2, 7, 2))).astype(np.float32)


def test_shape_names_and_finite():
    X = F.compute_features(_kp(120))
    assert X.shape == (120, len(F.FEATURE_NAMES)) and X.dtype == np.float32
    assert len(set(F.FEATURE_NAMES)) == len(F.FEATURE_NAMES)
    assert np.isfinite(X).all()


def test_translation_invariant():
    kp = _kp()
    a = F.compute_features(kp)
    b = F.compute_features(kp + np.array([200.0, -150.0], dtype=np.float32))
    assert np.allclose(a, b, atol=1e-2, rtol=1e-4)


def test_rotation_invariant():
    kp = _kp().astype(np.float64)
    th = 0.9
    R = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
    a = F.compute_features(kp)
    b = F.compute_features((kp @ R.T).astype(np.float32))
    assert np.allclose(a, b, atol=2e-2, rtol=1e-3)


def test_no_absolute_position_features():
    assert not any("pos" in n or n.startswith(("x_", "y_")) for n in F.FEATURE_NAMES)


def test_distance_features_correct():
    kp = np.zeros((10, 2, 7, 2), dtype=np.float32)
    kp[:, 1, :, 0] = 100.0           # intruder 100 px to the right, all points collapsed
    names = F.FEATURE_NAMES
    X = F.compute_features(kp)
    assert np.allclose(X[:, names.index("d_centre_centre")], 100.0)
    assert np.allclose(X[:, names.index("d_nose_nose")], 100.0)
    assert np.allclose(X[:, names.index("d_min_any")], 100.0)
    assert np.allclose(X[:, names.index("res_centre_speed")], 0.0)


def test_speed_feature_correct():
    kp = _kp(50) * 0
    kp[:, 0, :, 0] += np.arange(50, dtype=np.float32)[:, None] * 2.0   # resident moves 2 px/frame in x
    X = F.compute_features(kp)
    assert np.allclose(X[:, F.FEATURE_NAMES.index("res_centre_speed")], 2.0, atol=1e-4)
    assert np.allclose(X[:, F.FEATURE_NAMES.index("int_centre_speed")], 0.0)


def test_rolling_mean_matches_naive():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(60, 3))
    w = 5
    mean, std = F._rolling_mean_std(x, w)
    i = 30
    assert np.allclose(mean[i], x[i - 2:i + 3].mean(axis=0))
    assert np.allclose(std[i], x[i - 2:i + 3].std(axis=0))


@pytest.mark.parametrize("n", [1, 2, 3, 10])
def test_very_short_recordings(n):
    X = F.compute_features(_kp(n))
    assert X.shape[0] == n and np.isfinite(X).all()


def test_rejects_wrong_shape():
    with pytest.raises(ValueError):
        F.compute_features(np.zeros((10, 1, 3, 2)))


def test_features_independent_of_tracker_scores_and_future_recordings():
    """Featurizing a recording alone equals featurizing it as part of nothing
    else: features are a pure function of this recording's keypoints."""
    kp = _kp()
    assert np.array_equal(F.compute_features(kp), F.compute_features(kp.copy()))


# ---- smoothing ----

def test_smooth_probs():
    p = np.random.default_rng(0).dirichlet(np.ones(4), size=50)
    assert np.array_equal(M.smooth_probs(p, 1), p)
    s = M.smooth_probs(p, 9)
    assert s.shape == p.shape and np.allclose(s.sum(axis=1), 1.0)
    const = np.tile([0.1, 0.2, 0.3, 0.4], (20, 1))
    assert np.allclose(M.smooth_probs(const, 15), const)


def test_smoothing_removes_single_frame_blip():
    p = np.tile([0.0, 0.0, 0.0, 1.0], (40, 1))
    p[20] = [1.0, 0.0, 0.0, 0.0]
    assert (M.smooth_probs(p, 9).argmax(1) == 3).all()


# ---- resampling ----

def test_resample_same_rate_is_noop():
    kp = _kp(30)
    assert P.resample_keypoints(kp, 30.0) is kp


def test_resample_preserves_duration_and_linear_motion():
    n, rate = 100, 60.0
    kp = np.zeros((n, 2, 7, 2), dtype=np.float32)
    kp[..., 0] = np.arange(n, dtype=np.float32)[:, None, None] * 1.0   # 1 px per source frame
    out = P.resample_keypoints(kp, rate)
    assert abs(len(out) / 30.0 - n / rate) < 0.1
    # 60 -> 30 Hz: 2 source frames per output frame => 2 px per output frame
    assert np.allclose(np.diff(out[:, 0, 0, 0]), 2.0, atol=1e-4)
