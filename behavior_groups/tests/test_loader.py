import json

import h5py
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

import jellyfish_loader as jl

SCORED = ["mouse1,mouse2,attack", "mouse1,mouse2,sniff", "mouse1,self,dig"]
HEADER = ["lab_id", "video_id", "split", "frames_per_second", "video_duration_sec", "behaviors_labeled", "mouse1_id",
          "mouse1_condition", "mouse2_condition", "n_bouts"]


def write_video(d, vid="v1", first=4950, n_frames=300, bouts=None, condition="stress", scored=SCORED, shift=None,
                mouse1_id="1", duration=None, m2_condition="", n_bouts=None, fps="30.0"):
    bouts = [("mouse1", "mouse2", "attack", first + 10, first + 40)] if bouts is None else bouts
    pq.write_table(pa.table({
        "agent_id": [b[0] for b in bouts], "target_id": [b[1] for b in bouts], "action": [b[2] for b in bouts],
        "start_frame": pa.array([b[3] for b in bouts], pa.int32()), "stop_frame": pa.array([b[4] for b in bouts], pa.int32()),
    }), d / f"{vid}.annotation.pkt")
    frames = list(range(first, first + n_frames))
    pq.write_table(pa.table({"video_frame": frames, "mouse_id": ["mouse1"] * n_frames, "bodypart": ["nose"] * n_frames,
                             "x": [0.0] * n_frames, "y": [0.0] * n_frames}), d / f"{vid}.tracking.pkt")
    meta = {"provenance": {"bout_time_map": {"scale": 1.0, "offset": shift}} if shift is not None else {}}
    with h5py.File(d / f"{vid}.slp", "w") as f:
        f.create_group("metadata").attrs["json"] = json.dumps(meta)
    return {"lab_id": jl.LAB, "video_id": vid, "split": "train", "frames_per_second": fps,
            "video_duration_sec": str(duration if duration is not None else n_frames / 30), "behaviors_labeled": json.dumps(scored),
            "mouse1_id": mouse1_id, "mouse1_condition": condition, "mouse2_condition": m2_condition,
            "n_bouts": str(len(bouts) if n_bouts is None else n_bouts)}


def write_csv(d, rows):
    import csv

    with open(d / "videos.csv", "w", newline="") as f:
        w = csv.DictWriter(f, HEADER)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def test_loads_window_from_tracking_not_from_zero(tmp_path):
    write_csv(tmp_path, [write_video(tmp_path)])
    (v,) = jl.load_videos(tmp_path)
    assert v.window == (4950, 5250) and v.n_frames == 300 and v.group == "stress"
    assert v.bouts[0].start == 4960 and v.time_shift_frames is None


def test_group_label_mapping_and_unknown_label(tmp_path):
    write_csv(tmp_path, [write_video(tmp_path, condition="social isolation")])
    assert jl.load_videos(tmp_path)[0].group == "isolation"
    write_csv(tmp_path, [write_video(tmp_path, condition="shocked")])
    with pytest.raises(ValueError, match="unknown mouse1_condition"):
        jl.load_videos(tmp_path)


def test_stop_frame_is_exclusive_and_bouts_are_clipped_to_window(tmp_path):
    bouts = [("mouse1", "mouse2", "attack", 4940, 4960), ("mouse1", "mouse2", "attack", 5240, 5260), ("mouse1", "mouse2", "attack", 6000, 6010)]
    write_csv(tmp_path, [write_video(tmp_path, bouts=bouts)])
    (v,) = jl.load_videos(tmp_path)
    assert [(b.start, b.stop) for b in v.bouts] == [(4950, 4960), (5240, 5250)]
    assert v.n_bouts_clipped == 3


def test_rejects_bouts_for_unscored_behaviors(tmp_path):
    bouts = [("mouse1", "mouse2", "escape", 4960, 4970)]
    write_csv(tmp_path, [write_video(tmp_path, bouts=bouts)])
    with pytest.raises(ValueError, match="not listed as scored"):
        jl.load_videos(tmp_path)


def test_rejects_duration_mismatch_and_gappy_pose_and_count_mismatch(tmp_path):
    write_csv(tmp_path, [write_video(tmp_path, duration=100)])
    with pytest.raises(ValueError, match="videos.csv says"):
        jl.load_videos(tmp_path)
    write_csv(tmp_path, [write_video(tmp_path, n_bouts=5)])
    with pytest.raises(ValueError, match="bouts in the file"):
        jl.load_videos(tmp_path)
    row = write_video(tmp_path)
    pq.write_table(pa.table({"video_frame": [4950, 4951, 4999]}), tmp_path / "v1.tracking.pkt")
    write_csv(tmp_path, [row])
    with pytest.raises(ValueError, match="gaps"):
        jl.load_videos(tmp_path)


def test_rejects_wrong_columns_and_empty_bouts(tmp_path):
    row = write_video(tmp_path)
    pq.write_table(pa.table({"agent_id": ["mouse1"]}), tmp_path / "v1.annotation.pkt")
    write_csv(tmp_path, [row])
    with pytest.raises(ValueError, match="columns"):
        jl.load_videos(tmp_path)
    write_csv(tmp_path, [write_video(tmp_path, bouts=[("mouse1", "mouse2", "attack", 5000, 5000)])])
    with pytest.raises(ValueError, match="empty or reversed"):
        jl.load_videos(tmp_path)


def test_rejects_intruder_condition_and_repeated_animal_and_wrong_fps(tmp_path):
    write_csv(tmp_path, [write_video(tmp_path, m2_condition="naive")])
    with pytest.raises(ValueError, match="mouse2 has a condition"):
        jl.load_videos(tmp_path)
    write_csv(tmp_path, [write_video(tmp_path, fps="25.0")])
    with pytest.raises(ValueError, match="frame rate"):
        jl.load_videos(tmp_path)
    write_csv(tmp_path, [write_video(tmp_path, "a", mouse1_id="3"), write_video(tmp_path, "b", mouse1_id="3")])
    with pytest.raises(ValueError, match="same animal"):
        jl.load_videos(tmp_path)


def test_reads_the_time_shift_from_slp_provenance(tmp_path):
    write_csv(tmp_path, [write_video(tmp_path, shift=-23)])
    assert jl.load_videos(tmp_path)[0].time_shift_frames == -23
    write_csv(tmp_path, [write_video(tmp_path)])
    assert jl.load_videos(tmp_path)[0].time_shift_frames is None


def test_other_labs_are_ignored(tmp_path):
    row = write_video(tmp_path)
    other = {**row, "lab_id": "UppityFerret", "video_id": "zzz"}
    write_csv(tmp_path, [row, other])
    assert [v.video_id for v in jl.load_videos(tmp_path)] == ["v1"]
