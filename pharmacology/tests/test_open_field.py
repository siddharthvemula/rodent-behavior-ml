import json

import numpy as np
import pytest

import open_field as of


def parts_for(xy, lik=None, corners=((100, 100), (300, 100), (100, 300), (300, 300))):
    n = len(xy)
    lik = np.ones(n) if lik is None else np.asarray(lik, float)
    out = {name: np.column_stack([np.full(n, c[0]), np.full(n, c[1]), np.ones(n)])
           for name, c in zip(("tl", "tr", "bl", "br"), corners)}
    out[of.BODY_PART] = np.column_stack([np.asarray(xy, float), lik])
    return out


def line(n, step=2.0, y=200.0):
    return np.column_stack([100 + step * np.arange(n), np.full(n, y)])


def test_straight_line_distance_and_speed():
    m = of.compute_metrics(parts_for(line(11)))  # 10 steps of 2 px
    assert m["distance_px"] == pytest.approx(20.0)
    assert m["mean_speed_px_per_frame"] == pytest.approx(2.0)
    assert m["distance_arena_widths"] == pytest.approx(20.0 / 200.0)


def test_jump_excluded():
    xy = line(11)
    xy[5:, 0] += 400  # one 402 px teleport at step 4->5
    m = of.compute_metrics(parts_for(xy))
    assert m["jump_steps"] == 1
    assert m["distance_px"] == pytest.approx(18.0)
    assert m["mean_speed_px_per_frame"] == pytest.approx(2.0)


def test_short_gap_interpolated_long_gap_excluded():
    lik = np.ones(30)
    lik[5:8] = 0.1  # 3-frame gap: interpolated
    short = of.compute_metrics(parts_for(line(30), lik))
    assert short["missing_frame_pct"] == 0
    assert short["distance_px"] == pytest.approx(58.0)
    lik = np.ones(30)
    lik[5:15] = 0.1  # 10-frame gap: stays missing
    long = of.compute_metrics(parts_for(line(30), lik))
    assert long["missing_frame_pct"] == pytest.approx(100 * 10 / 30)
    assert long["distance_px"] == pytest.approx(2.0 * (4 + 14))  # steps across the gap dropped


def test_center_boundary():
    # arena 100..300 -> center spans 100+0.1464*200 = 129.3 .. 270.7
    xy = [[200, 200], [129.0, 200], [129.6, 200], [270.4, 200], [271.0, 200]]
    m = of.compute_metrics(parts_for(xy))
    assert m["center_pct"] == pytest.approx(100 * 3 / 5)


def test_center_is_half_arena_area():
    assert (of.CENTER_HI - of.CENTER_LO) ** 2 == pytest.approx(0.5)


def test_normalization_follows_shifted_scaled_arena():
    parts = parts_for(line(3), corners=((500, 50), (900, 50), (500, 450), (900, 450)))
    origin, u, v, side = of.arena_frame(parts)
    assert side == pytest.approx(400)
    got = of.normalize(np.array([[700.0, 250.0], [500.0, 50.0], [900.0, 450.0]]), origin, u, v)
    assert np.allclose(got, [[0.5, 0.5], [0, 0], [1, 1]])


def test_read_dlc_three_row_header(tmp_path):
    p = tmp_path / "x.csv"
    p.write_text(
        "scorer,s,s,s,s,s,s\n"
        "bodyparts,tl,tl,tl,bodycentre,bodycentre,bodycentre\n"
        "coords,x,y,likelihood,x,y,likelihood\n"
        "0,1,2,0.99,3,4,0.5\n"
        "1,1,2,0.99,5,6,0.7\n"
    )
    parts = of.read_dlc(p)
    assert set(parts) == {"tl", "bodycentre"}
    assert parts["bodycentre"].tolist() == [[3, 4, 0.5], [5, 6, 0.7]]


# ---- malformed / degenerate input (HARDENING_PLAN.md D) ----

def _dlc(tmp_path, text, name="x.csv"):
    p = tmp_path / name
    p.write_text(text)
    return p


GOOD_HEADER = (
    "scorer,s,s,s\n"
    "bodyparts,bodycentre,bodycentre,bodycentre\n"
    "coords,x,y,likelihood\n"
)


@pytest.mark.parametrize(
    "text, message",
    [
        ("", "need 3 header rows"),
        (GOOD_HEADER, "need 3 header rows"),
        ("a,b,c\n1,2,3\n", "need 3 header rows"),
        ("scorer,s\nbodyparts,bodycentre\ncoords,x\n0,1\n", "x, y, likelihood"),
        (GOOD_HEADER + "0,1,2,0.9\n1,2,3\n", "line 5 has 3 columns"),
        (GOOD_HEADER + "0,1,,0.9\n", "non-numeric or empty"),
    ],
)
def test_read_dlc_rejects_malformed_files_with_file_name_and_reason(tmp_path, text, message):
    with pytest.raises(ValueError, match=message) as e:
        of.read_dlc(_dlc(tmp_path, text, "bad.csv"))
    assert "bad.csv" in str(e.value)


def test_read_dlc_accepts_nan_cells(tmp_path):
    parts = of.read_dlc(_dlc(tmp_path, GOOD_HEADER + "0,nan,2,0.9\n1,3,4,0.9\n"))
    assert np.isnan(parts["bodycentre"][0, 0])


def test_missing_corner_or_bodypart_is_a_clear_error():
    parts = parts_for(line(10))
    del parts["bl"]
    with pytest.raises(ValueError, match="missing arena corner markers: bl"):
        of.compute_metrics(parts)
    parts = parts_for(line(10))
    del parts[of.BODY_PART]
    with pytest.raises(ValueError, match="bodycentre"):
        of.compute_metrics(parts)


def test_collinear_corners_are_a_clear_error():
    with pytest.raises(ValueError, match="collinear"):
        of.compute_metrics(parts_for(line(10), corners=((0, 0), (100, 0), (200, 0), (300, 0))))


def test_all_low_likelihood_or_single_frame_raises_instead_of_returning_nan():
    with pytest.raises(ValueError, match="usable frames"):
        of.compute_metrics(parts_for(line(20), lik=np.full(20, 0.1)))
    with pytest.raises(ValueError, match="usable frames"):
        of.compute_metrics(parts_for(line(1)))


def test_valid_metrics_are_all_finite():
    m = of.compute_metrics(parts_for(line(20)))
    assert all(np.isfinite(v) for v in m.values())


def _write_dataset(root, n_frames, likelihood):
    (root / "data" / "Yohimbine_Roche").mkdir(parents=True)
    (root / "METADATA_ROCHE.csv").write_text("Animal ID;Dosage;DLC file\nm1;0;m1.csv\n", encoding="utf-8-sig")
    header = (
        "scorer," + ",".join(["s"] * 15) + "\n"
        "bodyparts," + ",".join(f"{p},{p},{p}" for p in ("tl", "tr", "bl", "br", "bodycentre")) + "\n"
        "coords," + ",".join("x,y,likelihood" for _ in range(5)) + "\n"
    )
    rows = []
    for i in range(n_frames):
        pts = [(0, 0), (400, 0), (0, 400), (400, 400), (100 + 2 * i, 200)]
        rows.append(f"{i}," + ",".join(f"{x},{y},{1.0 if k < 4 else likelihood[i]}" for k, (x, y) in enumerate(pts)))
    (root / "data" / "Yohimbine_Roche" / "m1.csv").write_text(header + "\n".join(rows) + "\n")


def test_build_names_the_animal_and_enforces_min_valid_fraction(tmp_path):
    _write_dataset(tmp_path, 40, [1.0] * 40)
    out = of.build(tmp_path)
    assert out["mice"][0]["id"] == "m1"
    json.dumps(out, allow_nan=False)                       # finite: safe to ship

    bad = tmp_path / "bad"
    _write_dataset(bad, 40, [1.0] * 10 + [0.1] * 30)       # only 25% usable (long gap, not interpolated)
    with pytest.raises(ValueError, match=r"animal m1 \(m1\.csv\).*usable"):
        of.build(bad)
