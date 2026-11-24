"""Loader for the InvincibleJellyfish recordings of DANDI 000564 (Days of our Mice, DooM).

Isolated on purpose: nothing here is shared with the CalMS21 loader or the classifier, and the
annotation vocabulary (dominancegroom, sniff, sniffgenital, dig, selfgroom, attack, allogroom, escape)
is NOT mapped onto the classifier's classes.

Per video, three files plus one row of videos.csv:
  <id>.annotation.pkt  Parquet: agent_id, target_id, action, start_frame, stop_frame (stop EXCLUSIVE)
  <id>.tracking.pkt    Parquet: video_frame, mouse_id, bodypart, x, y   (read only for the frame range)
  <id>.slp             SLEAP/HDF5; read only for the provenance record of bout-time corrections
  videos.csv           group label (mouse1_condition), frame rate, duration, and `behaviors_labeled`

Facts this loader checks rather than assumes (found while exploring the real files):
 * Frame numbers do not start at 0. Both the pose and the bouts live on a timeline whose first
   frame is ~4950, so the observation window of a video is its TRACKED frame range, taken from
   the tracking file, never 0..duration.
 * A behavior is "not happening" only if its (agent, target, action) triplet is in
   `behaviors_labeled`; an unlisted triplet is UNKNOWN for the whole video, not absent.
 * The group is the condition of mouse1, the resident. mouse2 (the intruder) has no condition.
"""
import csv
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, FrozenSet, List, Optional, Tuple

LAB = "InvincibleJellyfish"
FPS = 30.0
# videos.csv label -> our group name
GROUPS = {"naive": "naive", "stress": "stress", "social isolation": "isolation", "mated": "mated"}
ANNOTATION_COLUMNS = ["agent_id", "target_id", "action", "start_frame", "stop_frame"]
Triplet = Tuple[str, str, str]  # (agent, target, action); target "self" = non-directed
FPS_TOLERANCE_SEC = 1.0  # tracked frames / fps must match the stated duration to within this


@dataclass(frozen=True)
class Bout:
    agent: str
    target: str
    action: str
    start: int  # first frame
    stop: int   # one past the last frame


@dataclass
class Video:
    video_id: str
    group: str
    split: str                      # the competition's train/test label; carried, not used
    mouse1_id: str
    fps: float
    duration_sec: float
    window: Tuple[int, int]         # [first, stop) tracked frames: the observation window
    scored: FrozenSet[Triplet]
    bouts: List[Bout] = field(default_factory=list)
    time_shift_frames: Optional[int] = None  # the dataset's correction to this video's bouts (None = none)
    n_bouts_clipped: int = 0        # bout frames that fell outside the window and were clipped

    @property
    def n_frames(self) -> int:
        return self.window[1] - self.window[0]


# ------------------------------------------------------------------ files ----
def read_bouts(path: Path) -> List[Bout]:
    import pyarrow.parquet as pq

    table = pq.read_table(path)
    if table.column_names != ANNOTATION_COLUMNS:
        raise ValueError(f"{path.name}: columns are {table.column_names}, expected {ANNOTATION_COLUMNS}")
    bouts = [Bout(r["agent_id"], r["target_id"], r["action"], int(r["start_frame"]), int(r["stop_frame"])) for r in table.to_pylist()]
    for b in bouts:
        if b.stop <= b.start:
            raise ValueError(f"{path.name}: empty or reversed bout {b}")
    return bouts


def read_frame_range(path: Path) -> Tuple[int, int]:
    """[first, stop) of the frames that have pose, checked to be gap-free."""
    import pyarrow.compute as pc
    import pyarrow.parquet as pq

    col = pq.read_table(path, columns=["video_frame"])["video_frame"]
    unique = pc.unique(col)
    first, last = int(pc.min(unique).as_py()), int(pc.max(unique).as_py())
    if len(unique) != last - first + 1:
        raise ValueError(f"{path.name}: pose frames {first}..{last} have gaps ({len(unique)} of {last - first + 1} present)")
    return first, last + 1


def read_time_shift(path: Path) -> Optional[int]:
    """The correction the dataset applied to this video's bouts (frames), or None if none was applied."""
    import h5py

    with h5py.File(path, "r") as f:
        meta = json.loads(f["metadata"].attrs["json"])
    shift = meta.get("provenance", {}).get("bout_time_map")
    if shift is None:
        return None
    if shift.get("scale") != 1.0 or not isinstance(shift.get("offset"), int):
        raise ValueError(f"{path.name}: unrecognised bout_time_map {shift}")
    return int(shift["offset"])


def parse_scored(cell: str) -> FrozenSet[Triplet]:
    triplets = []
    for item in json.loads(cell):
        parts = tuple(item.split(","))
        if len(parts) != 3:
            raise ValueError(f"behaviors_labeled entry {item!r} is not agent,target,action")
        triplets.append(parts)
    return frozenset(triplets)


# ------------------------------------------------------------------- load ----
def load_videos(data_dir: Path, with_provenance: bool = True) -> List[Video]:
    csv_path = data_dir / "videos.csv"
    with open(csv_path, newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["lab_id"] == LAB]
    if not rows:
        raise ValueError(f"no {LAB} rows in {csv_path}")
    videos = []
    for row in rows:
        vid = row["video_id"]
        try:
            videos.append(_load_one(data_dir, row, with_provenance))
        except (ValueError, KeyError, OSError) as exc:
            raise ValueError(f"video {vid}: {exc}") from exc
    videos.sort(key=lambda v: (v.group, v.video_id))
    ids = [v.mouse1_id for v in videos]
    if len(set(ids)) != len(ids):
        raise ValueError("mouse1_id repeats across videos: the same animal is in more than one recording")
    return videos


def _load_one(data_dir: Path, row: Dict[str, str], with_provenance: bool) -> Video:
    vid = row["video_id"]
    label = row["mouse1_condition"]
    if label not in GROUPS:
        raise ValueError(f"unknown mouse1_condition {label!r}")
    if row["mouse2_condition"]:
        raise ValueError("mouse2 has a condition; the group definition (mouse1 = resident) no longer holds")
    fps = float(row["frames_per_second"])
    if fps != FPS:
        raise ValueError(f"frame rate {fps}, expected {FPS}")
    duration = float(row["video_duration_sec"])
    window = read_frame_range(data_dir / f"{vid}.tracking.pkt")
    if abs((window[1] - window[0]) / fps - duration) > FPS_TOLERANCE_SEC:
        raise ValueError(f"pose covers {(window[1] - window[0]) / fps:.1f} s but videos.csv says {duration} s")
    scored = parse_scored(row["behaviors_labeled"])
    bouts = read_bouts(data_dir / f"{vid}.annotation.pkt")
    if len(bouts) != int(row["n_bouts"]):
        raise ValueError(f"{len(bouts)} bouts in the file, videos.csv says {row['n_bouts']}")
    unlisted = {(b.agent, b.target, b.action) for b in bouts} - scored
    if unlisted:
        raise ValueError(f"bouts for behaviors not listed as scored: {sorted(unlisted)}")
    lo, hi = window
    clipped = 0
    kept = []
    for b in bouts:
        if b.stop <= lo or b.start >= hi:
            clipped += 1  # entirely outside the window: dropped
            continue
        if b.start < lo or b.stop > hi:
            clipped += 1
            b = Bout(b.agent, b.target, b.action, max(b.start, lo), min(b.stop, hi))
        kept.append(b)
    shift = read_time_shift(data_dir / f"{vid}.slp") if with_provenance else None
    return Video(vid, GROUPS[label], row["split"], row["mouse1_id"], fps, duration, window, scored, kept, shift, clipped)
