"""The committed JSON the frontend reads must be exactly what the code produces from the committed inputs."""
import json

import group_comparison as gc
import group_metrics as gm


def test_group_comparison_json_regenerates_exactly_from_jellyfish_videos_json():
    committed = json.loads(gc.DEST.read_text())
    assert gc.analyze(json.loads(gc.SRC.read_text())) == committed


def test_jellyfish_videos_json_matches_the_locked_design():
    d = json.loads(gm.DEST.read_text())
    assert d["parameters"]["primary_metrics"] == list(gm.PRIMARY)
    assert d["parameters"]["group_sizes"] == {"naive": 8, "stress": 14, "isolation": 14, "mated": 14}
    assert len(d["videos"]) == 50 and len({v["mouse1_id"] for v in d["videos"]}) == 50
    assert not any(k.startswith(("allogroom", "escape")) for v in d["videos"] for k in v)
    for v in d["videos"]:
        assert all(0 <= v[f"{b}_time_pct"] <= 100 and v[f"{b}_bouts_per_min"] >= 0 for b in gm.BEHAVIORS)
