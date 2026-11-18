import json

import numpy as np
import pytest

import preprocess as P


def _calms21_json(n_frames=40, n_seq=3, vocab=None, label_fn=None):
    """Tiny file with the real CalMS21 Task 1 layout: raw keypoints are
    (T, mouse, x/y, part); x and y are made distinguishable (x < 1000 < ... y)
    so an axis mix-up shows up in assertions."""
    rng = np.random.default_rng(0)
    vocab = vocab or {"attack": 0, "investigation": 1, "mount": 2, "other": 3}
    seqs = {}
    for s in range(n_seq):
        kp = np.empty((n_frames, 2, 2, 7))
        kp[:, :, 0, :] = rng.uniform(0, 1000, (n_frames, 2, 7))  # x
        kp[:, :, 1, :] = rng.uniform(0, 500, (n_frames, 2, 7))   # y
        labels = (label_fn(n_frames) if label_fn else np.arange(n_frames) % 4)
        seqs[f"task1/train/mouse{s:03d}_task1_annotator1"] = {
            "keypoints": kp.tolist(),
            "scores": rng.uniform(0, 1, (n_frames, 2, 7)).tolist(),
            "annotations": np.asarray(labels).tolist(),
            "metadata": {"annotator-id": 0, "vocab": vocab},
        }
    return {"annotator-id_0": seqs}


def _write(tmp_path, data, name="calms21_task1_train.json"):
    p = tmp_path / name
    p.write_text(json.dumps(data))
    return p


def test_label_order_matches_calms21_ids():
    assert P.BEHAVIOR_LABELS == ["attack", "investigation", "mount", "other"]
    assert "grooming" not in P.BEHAVIOR_LABELS and "rearing" not in P.BEHAVIOR_LABELS


def test_load_calms21_shapes_and_axis_order(tmp_path):
    data = _calms21_json()
    recs = P.load_calms21(_write(tmp_path, data))
    assert len(recs) == 3
    r = recs[0]
    assert r.keypoints.shape == (40, 2, 7, 2) and r.keypoints.dtype == np.float32
    assert r.scores.shape == (40, 2, 7) and r.labels.shape == (40,)
    raw = np.array(data["annotator-id_0"][r.id]["keypoints"])  # (T, mouse, xy, part)
    # canonical[t, m, part, xy] == raw[t, m, xy, part]
    assert np.allclose(r.keypoints[5, 1, 3, 0], raw[5, 1, 0, 3])  # x of mouse 1, part 3
    assert np.allclose(r.keypoints[5, 1, 3, 1], raw[5, 1, 1, 3])  # y of mouse 1, part 3


def test_load_calms21_rejects_changed_vocab(tmp_path):
    bad = _calms21_json(vocab={"attack": 0, "investigation": 1, "mount": 3, "other": 2})
    with pytest.raises(P.KeypointsFormatError, match="vocab"):
        P.load_calms21(_write(tmp_path, bad))


def test_load_calms21_rejects_out_of_range_label(tmp_path):
    bad = _calms21_json(label_fn=lambda n: np.full(n, 4))
    with pytest.raises(P.KeypointsFormatError, match="label ids"):
        P.load_calms21(_write(tmp_path, bad))


def test_load_calms21_rejects_unlabeled_file(tmp_path):
    data = _calms21_json()
    for seq in data["annotator-id_0"].values():
        del seq["annotations"]
    with pytest.raises(P.KeypointsFormatError, match="annotations"):
        P.load_calms21(_write(tmp_path, data))


def test_load_calms21_rejects_length_mismatch(tmp_path):
    data = _calms21_json()
    next(iter(data["annotator-id_0"].values()))["annotations"].pop()
    with pytest.raises(P.KeypointsFormatError, match="inconsistent"):
        P.load_calms21(_write(tmp_path, data))


def test_npz_roundtrip(tmp_path):
    recs = P.load_calms21(_write(tmp_path, _calms21_json(n_frames=25, n_seq=4)))
    out = tmp_path / "cache.npz"
    P.save_recordings(recs, out)
    back = P.load_recordings(out)
    assert [r.id for r in back] == [r.id for r in recs]
    for a, b in zip(recs, back):
        assert np.array_equal(a.keypoints, b.keypoints)
        assert np.array_equal(a.scores, b.scores)
        assert np.array_equal(a.labels, b.labels)


def test_train_val_split_is_by_recording_and_deterministic(tmp_path):
    recs = P.load_calms21(_write(tmp_path, _calms21_json(n_seq=10)))
    tr, va = P.train_val_split(recs, 0.2, seed=1)
    assert len(va) == 2 and len(tr) == 8
    assert not {r.id for r in tr} & {r.id for r in va}
    tr2, va2 = P.train_val_split(recs, 0.2, seed=1)
    assert [r.id for r in va] == [r.id for r in va2]


def test_train_val_split_never_empties_a_side(tmp_path):
    recs = P.load_calms21(_write(tmp_path, _calms21_json(n_seq=2)))
    tr, va = P.train_val_split(recs, 0.99)
    assert len(tr) == 1 and len(va) == 1


def test_label_counts(tmp_path):
    recs = P.load_calms21(_write(tmp_path, _calms21_json(n_frames=40, n_seq=2)))
    assert P.label_counts(recs) == {"attack": 20, "investigation": 20, "mount": 20, "other": 20}


# ---- upload contract ------------------------------------------------------

def _canonical(n=6):
    rng = np.random.default_rng(1)
    return rng.uniform(0, 500, (n, 2, 7, 2)).astype(np.float32)


def test_upload_roundtrip():
    kp = _canonical()
    out, fr = P.parse_keypoints_json(json.dumps(P.to_json_dict(kp, 25.0)).encode())
    assert fr == 25.0 and out.shape == (6, 2, 7, 2)
    assert np.allclose(out, kp, atol=1e-4)


def test_upload_frame_rate_defaults_to_30():
    d = P.to_json_dict(_canonical())
    del d["frame_rate"]
    assert P.parse_keypoints_json(json.dumps(d).encode())[1] == 30.0


@pytest.mark.parametrize(
    "mutate",
    [
        lambda d: d.update(frames=[]),
        lambda d: d.pop("frames"),
        lambda d: d["frames"][0].update(mice=d["frames"][0]["mice"][:1]),   # one mouse
        lambda d: d["frames"][0]["mice"][1].pop("tail_base"),               # missing keypoint
        lambda d: d["frames"][0]["mice"][0].update(nose=[1.0]),             # bad point
        lambda d: d["frames"][0]["mice"][0].update(nose=["a", "b"]),
        lambda d: d["frames"][0].pop("mice"),
        lambda d: d.update(frame_rate="fast"),
        lambda d: d.update(frame_rate=0),
        lambda d: d["frames"].__setitem__(0, 5),
    ],
)
def test_upload_rejects_malformed(mutate):
    d = P.to_json_dict(_canonical())
    mutate(d)
    with pytest.raises(P.KeypointsFormatError):
        P.parse_keypoints_json(json.dumps(d).encode())


@pytest.mark.parametrize("raw", [b"not json", b"\xff\xfe\x00", b"[]", b'"x"', b"null"])
def test_upload_rejects_non_keypoint_bytes(raw):
    with pytest.raises(P.KeypointsFormatError):
        P.parse_keypoints_json(raw)


def test_upload_rejects_old_single_animal_schema():
    old = {"frame_rate": 30.0, "frames": [{"nose": [0, 0], "center": [0, 0], "tail_base": [0, 0]}]}
    with pytest.raises(P.KeypointsFormatError):
        P.parse_keypoints_json(json.dumps(old).encode())


def test_upload_rejects_nan():
    d = P.to_json_dict(_canonical())
    d["frames"][2]["mice"][0]["neck"] = [float("nan"), 1.0]
    with pytest.raises(P.KeypointsFormatError, match="NaN|infinite"):
        P.parse_keypoints_json(json.dumps(d).encode())
