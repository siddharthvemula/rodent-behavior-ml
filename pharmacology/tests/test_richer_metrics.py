import numpy as np
import pytest

import open_field as of
import richer_metrics as rm

CORNERS = ((100, 100), (300, 100), (100, 300), (300, 300))   # arena side 200 px; center zone = 129.3..270.7


def parts_for(xy, lik=None, nose_offset=(10.0, 0.0), corners=CORNERS):
    xy = np.asarray(xy, float)
    n = len(xy)
    lik = np.ones(n) if lik is None else np.asarray(lik, float)
    out = {name: np.column_stack([np.full(n, c[0]), np.full(n, c[1]), np.ones(n)])
           for name, c in zip(("tl", "tr", "bl", "br"), corners)}
    out[of.BODY_PART] = np.column_stack([xy, lik])
    out[rm.HEAD] = np.column_stack([xy + nose_offset, np.ones(n)])
    out[rm.TAIL] = np.column_stack([xy - np.array(nose_offset), np.ones(n)])
    return out


def line(n, step, x0=110.0, y=200.0):
    return np.column_stack([x0 + step * np.arange(n), np.full(n, y)])


def test_smoothed_speed_constant_and_stationary():
    sp = rm.smoothed_speed(line(100, 2.0))
    assert np.isnan(sp[:7]).all() and np.isnan(sp[-7:]).all()
    assert np.allclose(sp[7:-7], 2.0)
    still = rm.smoothed_speed(np.tile([150.0, 200.0], (100, 1)))
    assert np.allclose(still[7:-7], 0.0)


def test_smoothed_speed_rejects_jitter_a_stationary_mouse_has():
    rng = np.random.default_rng(0)
    jitter = np.tile([150.0, 200.0], (400, 1)) + rng.normal(0, 0.8, (400, 2))   # px noise, no real motion
    raw_step = np.hypot(*np.diff(jitter, axis=0).T).mean()
    assert raw_step > 0.9                                   # frame-to-frame steps look like movement...
    assert np.nanmean(rm.smoothed_speed(jitter)) < 0.3      # ...but smoothed speed does not


def test_smoothed_speed_masks_windows_with_a_jump_or_missing_frames():
    xy = line(100, 2.0)
    xy[50:] += [0, 80]                                      # tracking jump > MAX_STEP_PX at step 49->50
    sp = rm.smoothed_speed(xy)
    assert np.isnan(sp[43:57]).all() and not np.isnan(sp[30]) and not np.isnan(sp[70])
    xy2 = line(100, 2.0)
    xy2[40:46] = np.nan                                     # a gap longer than a window edge
    assert np.isnan(rm.smoothed_speed(xy2)[34:52]).all()


def test_smoothed_speed_short_input_is_all_nan():
    assert np.isnan(rm.smoothed_speed(line(10, 2.0))).all()


def test_immobility_half_still_half_moving():
    still = np.tile([150.0, 200.0], (300, 1))
    moving = line(300, 3.0, x0=150.0)
    r = rm.compute_rich(parts_for(np.vstack([still, moving])))
    assert r["immobility_pct"] == pytest.approx(50.0, abs=3.0)
    assert r["immobility_pct_t0.5"] <= r["immobility_pct"] <= r["immobility_pct_t2"]    # sensitivity is monotone
    assert r["immobile_bout_count"] == 1 and r["longest_immobile_bout_frames"] > 250


def test_center_pct_moving_ignores_stationary_frames():
    """Sits still in the center for 300 frames, then runs along the bottom edge at 2 px/frame.
    center_pct (all frames) is high, but center_pct_moving, which counts only moving frames, is ~0."""
    still_center = np.tile([200.0, 200.0], (300, 1))
    x = 105 + 2 * np.abs((np.arange(300) % 180) - 90).astype(float) * -1 + 180   # 105..285 at 2 px/frame
    edge_run = np.column_stack([x, np.full(300, 105.0)])                         # y=105: outside the center band
    both = parts_for(np.vstack([still_center, edge_run]))
    r = rm.compute_rich(both)
    assert r["center_pct_moving"] < 5.0
    assert of.compute_metrics(both)["center_pct"] > 40.0
    assert r["immobility_pct"] > 40.0


def test_center_pct_moving_in_center_and_corner_pct():
    x = 140 + np.abs((np.arange(300) % 120) - 60) * 2.0                          # 140..260 at 2 px/frame, inside the band
    r = rm.compute_rich(parts_for(np.column_stack([x, np.full(300, 200.0)])))
    assert r["center_pct_moving"] > 95.0 and r["corner_pct_moving"] == 0.0
    assert r["immobility_pct"] < 15.0          # only the turn-arounds, where the 15-frame window averages direction away


def test_corner_pct_moving_counts_frames_outside_band_on_both_axes():
    big = ((100, 100), (2100, 100), (100, 2100), (2100, 2100))                  # side 2000 px: corner band is 292 px wide
    w = np.abs((np.arange(400) % 160) - 80) * 3.0                                 # 0..240 at 3 px/frame per axis (4.2 px/frame)
    r = rm.compute_rich(parts_for(np.column_stack([105 + w, 105 + w]), corners=big))
    assert r["corner_pct_moving"] > 90.0 and r["center_pct_moving"] == 0.0
    mid = rm.compute_rich(parts_for(np.column_stack([1100 + w, 1100 + w]), corners=big))   # same motion in the middle
    assert mid["corner_pct_moving"] == 0.0 and mid["center_pct_moving"] > 95.0


def test_distance_bins_sum_to_total_when_divisible():
    r = rm.compute_rich(parts_for(line(601, 2.0, x0=105.0)), n_bins=6)         # 600 steps of 2 px = 1200 px = 6 widths
    assert r["frames_per_bin"] == 100
    assert sum(r["distance_bins_arena_widths"]) == pytest.approx(6.0)
    assert np.allclose(r["distance_bins_arena_widths"], 1.0)


def test_distance_bins_drop_the_remainder_and_ignore_jumps():
    r = rm.compute_rich(parts_for(line(610, 2.0, x0=105.0)), n_bins=6)         # 609 steps -> 6 bins of 101, 3 dropped
    assert r["frames_per_bin"] == 101
    assert sum(r["distance_bins_arena_widths"]) == pytest.approx(606 * 2.0 / 200.0)
    jumpy = line(601, 2.0, x0=105.0)
    jumpy[300:] += [0, 90]                                                       # one jump step, excluded like in open_field.py
    rj = rm.compute_rich(parts_for(jumpy), n_bins=6)
    assert sum(rj["distance_bins_arena_widths"]) == pytest.approx(599 * 2.0 / 200.0)


def test_body_length_is_nose_to_tailbase_in_arena_widths():
    r = rm.compute_rich(parts_for(line(200, 2.0, x0=105.0), nose_offset=(10.0, 0.0)))
    assert r["body_length_arena_widths"] == pytest.approx(20.0 / 200.0)


def test_errors_are_named_not_nan():
    with pytest.raises(ValueError, match="no moving frames"):
        rm.compute_rich(parts_for(np.tile([150.0, 200.0], (200, 1))))
    p = parts_for(line(200, 2.0))
    del p[rm.HEAD]
    with pytest.raises(ValueError, match="nose"):
        rm.compute_rich(p)
    with pytest.raises(ValueError, match="usable frames"):
        rm.compute_rich(parts_for(line(10, 2.0)))
    p = parts_for(line(200, 2.0))
    p[rm.TAIL][:, 2] = 0.1
    with pytest.raises(ValueError, match="tailbase"):
        rm.compute_rich(p)


def test_runs_helper():
    assert rm._runs(np.array([0, 1, 1, 0, 1, 1, 1, 0, 1], bool)) == [2, 3, 1]
    assert rm._runs(np.zeros(5, bool)) == []
    assert rm._runs(np.ones(4, bool)) == [4]
