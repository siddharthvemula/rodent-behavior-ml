"""Per-video behavior metrics from InvincibleJellyfish's own human annotations (phase 1 of 2).

    python behavior_groups/group_metrics.py [data_dir] [out.json]
    -> frontend/src/data/jellyfish_videos.json  (needs the raw data; the statistics in
       group_comparison.py then run from this committed JSON, as dose_response.py does)

No classifier is involved: these are the lab's human-scored bouts, used directly.

Choices fixed BEFORE any group comparison was looked at (only metadata, annotation structure and
pooled-over-groups sanity checks had been inspected)
 * Behaviors = the six scored in EVERY video of EVERY group (checked in code, per video, against
   `behaviors_labeled`): attack, dominancegroom, sniff, sniffgenital, dig, selfgroom.
   allogroom and escape are excluded: they are scored in only some videos.
 * Agent = mouse1, the resident, whose condition defines the group. mouse2's own sniffgenital
   (intruder -> resident) is a different animal's behavior and is excluded.
 * Time in behavior = percent of the video's observation window covered by the behavior (union of
   its bouts, so overlapping bouts are not double counted).
 * Bout frequency = bouts per minute of observation window. Bouts are the human-scored bouts, with
   same-behavior bouts that overlap or touch merged into one (none do in the current data; the
   rule is fixed so a change in the data cannot silently change the count).
   Rates and percentages, not counts, because the windows differ (570-636 s).
 * Observation window = the video's tracked frame range (see jellyfish_loader.py).
 * Primary metrics = both metrics for all six behaviors (12). Nothing else is primary.
"""
import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np

from jellyfish_loader import Bout, Video, load_videos

# (agent, target) of each included behavior; the action is the key.
BEHAVIORS: Dict[str, Tuple[str, str]] = {
    "attack": ("mouse1", "mouse2"),
    "dominancegroom": ("mouse1", "mouse2"),
    "sniff": ("mouse1", "mouse2"),
    "sniffgenital": ("mouse1", "mouse2"),
    "dig": ("mouse1", "self"),
    "selfgroom": ("mouse1", "self"),
}
EXCLUDED = {
    "allogroom": "scored in only some recordings of each group",
    "escape": "scored in only some recordings of each group",
    "mouse2,mouse1,sniffgenital": "the intruder's behavior, not the manipulated resident's",
}
METRIC_KINDS = {"time_pct": "Time in behavior (% of observation window)", "bouts_per_min": "Bouts per minute"}
PRIMARY = tuple(f"{b}_{k}" for b in BEHAVIORS for k in METRIC_KINDS)  # the 12 confirmatory metrics
GROUP_ORDER = ("naive", "stress", "isolation", "mated")
DATASET = {
    "name": "Days of our Mice (DooM): a cross-laboratory dataset of mouse social behavior",
    "lab": "InvincibleJellyfish",
    "url": "https://dandi.emberarchive.org/dandiset/000564/0.261015.2324",
    "dandiset": "000564",
    "version": "0.261015.2324",
    "license": "CC-BY-NC-SA-4.0",
    "doi": "https://doi.org/10.60533/ember-dandi.000564/0.261015.2324",
    "citation": ("Marks, M., Yang, R., Liu, Z., et al. (2026) Days of our Mice (DooM): a cross-laboratory dataset of mouse social "
                 "behavior (Version 0.261015.2324) [Data set]. DANDI Archive (EMBER). The full author list is at the DOI."),
    "contributing_lab": "Moriel Zelikowsky; Michael Conoscenti",
}
ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "frontend" / "src" / "data" / "jellyfish_videos.json"


def merged_intervals(bouts: List[Bout]) -> List[Tuple[int, int]]:
    """Sorted intervals with overlapping or touching ones merged."""
    out: List[List[int]] = []
    for b in sorted(bouts, key=lambda b: (b.start, b.stop)):
        if out and b.start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b.stop)
        else:
            out.append([b.start, b.stop])
    return [(a, b) for a, b in out]


def video_metrics(video: Video) -> Dict[str, float]:
    minutes = video.n_frames / video.fps / 60
    out: Dict[str, float] = {}
    for action, (agent, target) in BEHAVIORS.items():
        if (agent, target, action) not in video.scored:
            raise ValueError(f"video {video.video_id}: {agent},{target},{action} was not scored; coverage is not uniform")
        spans = merged_intervals([b for b in video.bouts if (b.agent, b.target, b.action) == (agent, target, action)])
        frames = sum(b - a for a, b in spans)
        out[f"{action}_time_pct"] = 100.0 * frames / video.n_frames
        out[f"{action}_bouts_per_min"] = len(spans) / minutes
    return out


def build(data_dir: Path) -> Dict:
    videos = load_videos(data_dir)
    sizes = {g: sum(v.group == g for v in videos) for g in GROUP_ORDER}
    if set(v.group for v in videos) != set(GROUP_ORDER):
        raise ValueError(f"groups found {sorted(set(v.group for v in videos))}, expected {list(GROUP_ORDER)}")
    rows = []
    for v in videos:
        m = video_metrics(v)
        if not all(np.isfinite(x) for x in m.values()):
            raise ValueError(f"video {v.video_id}: non-finite metric")
        rows.append({"video_id": v.video_id, "group": v.group, "mouse1_id": v.mouse1_id, "split": v.split,
                     "window_frames": v.n_frames, "window_sec": round(v.n_frames / v.fps, 2),
                     "time_shift_frames": v.time_shift_frames, "bouts_clipped_to_window": v.n_bouts_clipped, **m})
    return {
        "dataset": DATASET,
        "parameters": {
            "behaviors": {k: {"agent": a, "target": t} for k, (a, t) in BEHAVIORS.items()},
            "excluded": EXCLUDED,
            "metric_kinds": METRIC_KINDS,
            "primary_metrics": list(PRIMARY),
            "group_order": list(GROUP_ORDER),
            "group_sizes": sizes,
            "fps": videos[0].fps,
            "unit_of_analysis": "one recording = one resident mouse (mouse1_id is unique per recording)",
            "frame_timeline": "pose and bouts share a timeline starting near frame 4950; the window is the tracked frame range",
            "bout_rule": "same-behavior bouts that overlap or touch are merged",
        },
        "videos": rows,
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parent
    data_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data"
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEST
    result = build(data_dir)
    out.write_text(json.dumps(result, indent=1, allow_nan=False) + "\n")
    print(f"wrote {len(result['videos'])} videos to {out}")
