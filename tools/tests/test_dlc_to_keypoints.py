"""Tests for tools/dlc_to_keypoints.py.

Each test writes a tiny fake multi-animal DeepLabCut CSV, converts it, and
where it matters checks that backend/validation.py (the real upload checks)
accepts the result.
"""
import csv
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "backend"))

import dlc_to_keypoints as D  # noqa: E402
from validation import UploadRejected, validate_recording  # noqa: E402

# Offsets from each mouse's centre, in px: nose-to-tail is 100 px, like CalMS21.
OFFSETS = {
    "nose": (40, 0), "ear_left": (30, -8), "ear_right": (30, 8), "neck": (20, 0),
    "hip_left": (-20, -10), "hip_right": (-20, 10), "tail_base": (-60, 0),
}


def write_csv(path, n=150, animals=("mouse1", "mouse2"), names=None, likelihood=None,
              blank=None, single=False):
    """Fake DeepLabCut CSV. `names` renames body parts ({app_name: dlc_name});
    `likelihood(t, animal, part)` overrides the default 0.99; `blank` is a set of
    (t, animal, part) cells left empty, as DeepLabCut does for lost points."""
    names = names or {}
    parts = [names.get(k, k) for k in OFFSETS]
    cols = [(a, p, c) for a in animals for p in parts for c in ("x", "y", "likelihood")]
    if single:
        cols += [("single", "led", c) for c in ("x", "y", "likelihood")]
    rows = [
        ["scorer"] + ["DLC_resnet50_fake"] * len(cols),
        ["individuals"] + [a for a, _, _ in cols],
        ["bodyparts"] + [p for _, p, _ in cols],
        ["coords"] + [c for _, _, c in cols],
    ]
    inverse = {v: k for k, v in names.items()}
    for t in range(n):
        row = [str(t)]
        for a, p, c in cols:
            if a == "single":
                row.append("5" if c != "likelihood" else "0.9")
                continue
            m = animals.index(a)
            if blank and (t, a, p) in blank:
                row.append("")
                continue
            dx, dy = OFFSETS[inverse.get(p, p)]
            cx, cy = 300 + 200 * m + t * 0.5, 300 + np.sin(t / 10) * 20
            if c == "x":
                row.append(f"{cx + dx:.3f}")
            elif c == "y":
                row.append(f"{cy + dy:.3f}")
            else:
                row.append(str(likelihood(t, a, p) if likelihood else 0.99))
        rows.append(row)
    with open(path, "w", newline="") as f:
        csv.writer(f).writerows(rows)
    return path


def convert_file(path, **kw):
    return D.convert(D.read_dlc_csv(path), kw.pop("fps", 30.0), **kw)


def validate(result):
    return validate_recording(D.to_bytes(result.data), "file")


def test_keypoint_names_match_the_model():
    spec = importlib.util.spec_from_file_location("ml_preprocess", ROOT / "ml" / "preprocess.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert D.KEYPOINT_NAMES == mod.KEYPOINT_NAMES


def test_clean_file_converts_and_passes_backend_validation(tmp_path):
    res = convert_file(write_csv(tmp_path / "a.csv", n=330))  # 11 s: over the backend's 10 s "short" warning
    assert res.n_frames == 330 and res.warnings == []
    assert res.data["frame_rate"] == 30.0
    first = res.data["frames"][0]["mice"]
    assert first[0]["nose"] == [340.0, 300.0] and first[1]["tail_base"] == [440.0, 300.0]
    rec = validate(res)
    assert rec.keypoints.shape == (330, 2, 7, 2) and rec.duration == 11.0 and rec.warnings == []


def test_body_part_names_are_mapped(tmp_path):
    path = write_csv(tmp_path / "a.csv", names={"nose": "snout", "tail_base": "tailbase"})
    with pytest.raises(D.ConversionError, match=r"nose \(looked for 'nose'\).*--map"):
        convert_file(path)
    res = convert_file(path, mapping=D.parse_map("nose=snout, tail_base=tailbase"))
    assert res.data["frames"][0]["mice"][0]["nose"] == [340.0, 300.0]
    validate(res)


def test_bad_map_entries_are_rejected():
    with pytest.raises(D.ConversionError, match="app_name=dlc_name"):
        D.parse_map("nose")
    with pytest.raises(D.ConversionError, match="not one of the app's body parts"):
        D.parse_map("snout=nose")


def test_low_likelihood_and_empty_cells_become_null_and_short_gaps_are_repaired(tmp_path):
    low = {(t, "mouse1", "nose") for t in range(10, 13)}
    path = write_csv(tmp_path / "a.csv", likelihood=lambda t, a, p: 0.1 if (t, a, p) in low else 0.99,
                     blank={(50, "mouse2", "neck")})
    res = convert_file(path)
    frames = res.data["frames"]
    assert all(frames[t]["mice"][0]["nose"] == [None, None] for t in range(10, 13))
    assert frames[50]["mice"][1]["neck"] == [None, None]
    assert frames[9]["mice"][0]["nose"] != [None, None]
    assert any("written as [null, null]" in w for w in res.warnings)
    rec = validate(res)  # backend fills gaps of <= 5 frames and says so
    assert any("interpolat" in w.lower() or "gap" in w.lower() for w in rec.warnings)
    # a lower threshold keeps the shaky points
    assert convert_file(path, min_likelihood=0.05).data["frames"][10]["mice"][0]["nose"] != [None, None]


def test_long_gap_is_warned_about_and_backend_rejects_it(tmp_path):
    blank = {(t, "mouse1", "nose") for t in range(20, 40)}
    res = convert_file(write_csv(tmp_path / "a.csv", blank=blank))
    assert any("gap(s) of more than 5" in w for w in res.warnings)
    with pytest.raises(UploadRejected) as e:
        validate(res)
    assert e.value.status_code == 422


def test_resident_and_intruder_choose_the_order(tmp_path):
    path = write_csv(tmp_path / "a.csv")
    default = convert_file(path).data["frames"][0]["mice"]
    swapped = convert_file(path, resident="mouse2", intruder="mouse1").data["frames"][0]["mice"]
    assert swapped == [default[1], default[0]]
    assert convert_file(path, resident="mouse2").data["frames"][0]["mice"] == swapped
    with pytest.raises(D.ConversionError, match="animals found"):
        convert_file(path, resident="mouse9")
    with pytest.raises(D.ConversionError, match="must be different"):
        convert_file(path, resident="mouse1", intruder="mouse1")


def test_single_pseudo_animal_is_ignored(tmp_path):
    res = convert_file(write_csv(tmp_path / "a.csv", single=True))
    validate(res)


def test_more_than_two_animals_needs_a_choice(tmp_path):
    path = write_csv(tmp_path / "a.csv", animals=("m1", "m2", "m3"))
    with pytest.raises(D.ConversionError, match="needs exactly 2"):
        convert_file(path)
    validate(convert_file(path, resident="m3", intruder="m1"))


def test_single_animal_csv_is_explained(tmp_path):
    path = tmp_path / "single.csv"
    path.write_text("scorer,DLC,DLC\nbodyparts,nose,nose\ncoords,x,y\n0,1,2\n")
    with pytest.raises(D.ConversionError, match="single-animal"):
        D.read_dlc_csv(path)


def test_not_a_dlc_csv(tmp_path):
    path = tmp_path / "other.csv"
    path.write_text("time,x,y\n0,1,2\n")
    with pytest.raises(D.ConversionError, match="doesn't look like a DeepLabCut CSV"):
        D.read_dlc_csv(path)


def test_fps_must_be_in_the_backend_range(tmp_path):
    path = write_csv(tmp_path / "a.csv")
    for bad in (5, 1000, float("nan")):
        with pytest.raises(D.ConversionError, match="--fps"):
            convert_file(path, fps=bad)


def test_trimming_with_start_and_seconds(tmp_path):
    path = write_csv(tmp_path / "a.csv", n=300)
    res = convert_file(path, start_s=2.0, seconds=4.0)
    assert res.n_frames == 120
    assert res.data["frames"][0]["mice"][0]["nose"] == [340.0 + 60 * 0.5, round(300 + np.sin(6.0) * 20, 1)]
    with pytest.raises(D.ConversionError, match="select no frames"):
        convert_file(path, start_s=100)


def test_short_recording_and_odd_scale_are_warned(tmp_path):
    res = convert_file(write_csv(tmp_path / "a.csv", n=60))
    assert any("at least 3 s" in w for w in res.warnings)
    res = convert_file(write_csv(tmp_path / "b.csv"), fps=10)
    assert res.warnings == []  # 150 frames at 10 fps = 15 s


def test_command_line_writes_an_uploadable_file(tmp_path, capsys):
    path = write_csv(tmp_path / "a.csv", names={"nose": "snout"})
    out = tmp_path / "clip.json"
    assert D.main([str(path), "--fps", "30", "--map", "nose=snout", "-o", str(out)]) == 0
    validate_recording(out.read_bytes(), "file")
    assert json.loads(out.read_text())["frame_rate"] == 30.0
    captured = capsys.readouterr()
    assert "wrote" in captured.out and "camera setup" in captured.err

    assert D.main([str(path), "--list"]) == 0
    assert "mouse1: snout, ear_left" in capsys.readouterr().out

    assert D.main([str(path), "--fps", "30", "-o", str(out)]) == 1  # nose not mapped
    assert "missing body parts" in capsys.readouterr().err
