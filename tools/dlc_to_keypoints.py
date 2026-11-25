"""
Convert a multi-animal DeepLabCut CSV (two mice) into the keypoints JSON that
POST /api/predict and /api/compare accept (see ARCHITECTURE.md "Data schema").

    python tools/dlc_to_keypoints.py tracking.csv --fps 30 -o clip.json
    python tools/dlc_to_keypoints.py tracking.csv --fps 25 -o clip.json \\
        --map nose=snout,tail_base=tailbase --resident mouse2 --intruder mouse1
    python tools/dlc_to_keypoints.py tracking.csv --list      # show animals and body parts

What it does:
  * reads DeepLabCut's header rows (scorer / individuals / bodyparts / coords);
  * maps the lab's body-part names onto the app's 7 names (--map), and stops
    with a clear message if any of the 7 is missing;
  * puts the resident first (mice[0]) and the intruder second (mice[1]);
  * turns points below --min-likelihood (and empty cells) into [null, null], which
    the backend repairs when the gap is short (<= 5 frames) and rejects when
    it is long;
  * rounds coordinates to 0.1 px and warns about anything the backend will
    reject or flag (file over 4 MiB, too many frames, too short, long gaps,
    body size far from the training data).

Only numpy and the standard library, so it runs with the same install as
ml/ and backend/.

Caveat: the classifier was trained on one camera setup (CalMS21, top view,
1024x570 px, two mice of different coat colour). Recordings from other rigs
may convert fine and still get worse labels.
"""
import argparse
import csv
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np

# Must match ml/preprocess.py KEYPOINT_NAMES (a test checks this). Kept as a
# copy so this tool has no import-path dependency on ml/.
KEYPOINT_NAMES = ["nose", "ear_left", "ear_right", "neck", "hip_left", "hip_right", "tail_base"]
NOSE, TAIL = KEYPOINT_NAMES.index("nose"), KEYPOINT_NAMES.index("tail_base")

# Limits enforced by backend/main.py and backend/validation.py; used for warnings only.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_FRAMES = 20_000
MIN_FPS, MAX_FPS = 10.0, 500.0
MIN_DURATION_S = 3.0
MAX_GAP_FRAMES = 5
BODY_LEN_TYPICAL = (90.0, 300.0)  # nose-to-tail px the backend accepts without a warning

DEFAULT_MIN_LIKELIHOOD = 0.6


class ConversionError(ValueError):
    """The CSV can't be converted; the message says why and how to fix it."""


@dataclass
class DlcTable:
    individuals: List[str]              # in file order, unique
    bodyparts: Dict[str, List[str]]     # individual -> its body parts, file order
    columns: Dict[tuple, int]           # (individual, bodypart, coord) -> column index
    rows: List[List[str]]               # data rows (cells as text)


@dataclass
class Result:
    data: dict                          # the upload-ready JSON dict
    n_frames: int
    warnings: List[str] = field(default_factory=list)


# ---------------------------------------------------------------- reading

def read_dlc_csv(path: Path) -> DlcTable:
    """Parse a multi-animal DeepLabCut CSV into a lookup table."""
    with open(path, newline="", encoding="utf-8-sig") as f:
        all_rows = [r for r in csv.reader(f) if r]
    if not all_rows:
        raise ConversionError(f"{path} is empty")

    header: Dict[str, List[str]] = {}
    i = 0
    while i < len(all_rows) and all_rows[i][0].strip().lower() in ("scorer", "individuals", "bodyparts", "coords"):
        header[all_rows[i][0].strip().lower()] = [c.strip() for c in all_rows[i]]
        i += 1
    if "bodyparts" not in header or "coords" not in header:
        raise ConversionError(
            "this doesn't look like a DeepLabCut CSV (expected header rows starting with "
            "'scorer', 'individuals', 'bodyparts' and 'coords')"
        )
    if "individuals" not in header:
        raise ConversionError(
            "this is a single-animal DeepLabCut CSV (no 'individuals' row). The app needs two tracked "
            "mice; re-run DeepLabCut in multi-animal mode, or export with both animals."
        )

    ind_row, bp_row, coord_row = header["individuals"], header["bodyparts"], header["coords"]
    individuals: List[str] = []
    bodyparts: Dict[str, List[str]] = {}
    columns: Dict[tuple, int] = {}
    for c in range(1, len(coord_row)):
        coord = coord_row[c].lower()
        if coord not in ("x", "y", "likelihood") or c >= len(ind_row) or c >= len(bp_row):
            continue
        ind, bp = ind_row[c], bp_row[c]
        if ind not in bodyparts:
            individuals.append(ind)
            bodyparts[ind] = []
        if bp not in bodyparts[ind]:
            bodyparts[ind].append(bp)
        columns[(ind, bp, coord)] = c

    rows = all_rows[i:]
    if not rows:
        raise ConversionError("the CSV has header rows but no frames")
    return DlcTable(individuals, bodyparts, columns, rows)


def parse_map(text: Optional[str]) -> Dict[str, str]:
    """'nose=snout,tail_base=tailbase' -> {'nose': 'snout', 'tail_base': 'tailbase'}."""
    mapping: Dict[str, str] = {}
    if not text:
        return mapping
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        if "=" not in part:
            raise ConversionError(f"--map entry '{part}' must look like app_name=dlc_name, e.g. nose=snout")
        ours, theirs = (s.strip() for s in part.split("=", 1))
        if ours not in KEYPOINT_NAMES:
            raise ConversionError(f"--map: '{ours}' is not one of the app's body parts {KEYPOINT_NAMES}")
        mapping[ours] = theirs
    return mapping


# ---------------------------------------------------------------- converting

def _cell(row: List[str], col: int) -> float:
    if col >= len(row):
        return float("nan")
    v = row[col].strip()
    if v == "" or v.lower() == "nan":
        return float("nan")
    try:
        return float(v)
    except ValueError:
        raise ConversionError(f"non-numeric value '{v}' in column {col + 1}") from None


def _choose_mice(table: DlcTable, resident: Optional[str], intruder: Optional[str]) -> List[str]:
    known = table.individuals
    for name, flag in ((resident, "--resident"), (intruder, "--intruder")):
        if name is not None and name not in known:
            raise ConversionError(f"{flag} '{name}' is not in this file; animals found: {known}")
    if resident and intruder:
        if resident == intruder:
            raise ConversionError("--resident and --intruder must be different animals")
        return [resident, intruder]
    # DeepLabCut adds a 'single' pseudo-animal for unique body parts; never a mouse.
    candidates = [n for n in known if n.lower() != "single"]
    if resident:
        rest = [n for n in candidates if n != resident]
        if len(rest) != 1:
            raise ConversionError(f"pick the intruder with --intruder (animals found: {known})")
        return [resident, rest[0]]
    if intruder:
        rest = [n for n in candidates if n != intruder]
        if len(rest) != 1:
            raise ConversionError(f"pick the resident with --resident (animals found: {known})")
        return [rest[0], intruder]
    if len(candidates) != 2:
        raise ConversionError(
            f"found {len(candidates)} animals {candidates}; the app needs exactly 2. "
            "Choose them with --resident and --intruder."
        )
    return candidates


def _long_gaps(missing: np.ndarray) -> int:
    """Number of runs of missing frames longer than MAX_GAP_FRAMES, over all keypoints."""
    count = 0
    flat = missing.reshape(len(missing), -1)
    for j in range(flat.shape[1]):
        run = 0
        for v in flat[:, j]:
            run = run + 1 if v else 0
            if run == MAX_GAP_FRAMES + 1:
                count += 1
    return count


def convert(
    table: DlcTable,
    fps: float,
    mapping: Optional[Dict[str, str]] = None,
    resident: Optional[str] = None,
    intruder: Optional[str] = None,
    min_likelihood: float = DEFAULT_MIN_LIKELIHOOD,
    start_s: float = 0.0,
    seconds: Optional[float] = None,
) -> Result:
    """Turn a parsed DeepLabCut table into the upload JSON dict plus warnings."""
    if not np.isfinite(fps) or not (MIN_FPS <= fps <= MAX_FPS):
        raise ConversionError(f"--fps must be between {MIN_FPS:g} and {MAX_FPS:g} (the backend's accepted range)")
    if not 0.0 <= min_likelihood <= 1.0:
        raise ConversionError("--min-likelihood must be between 0 and 1")
    mapping = mapping or {}
    mice = _choose_mice(table, resident, intruder)

    # Column for each (mouse, app keypoint, x/y/likelihood).
    cols = np.zeros((2, len(KEYPOINT_NAMES), 3), dtype=np.int64)
    for m, ind in enumerate(mice):
        missing = []
        for k, ours in enumerate(KEYPOINT_NAMES):
            theirs = mapping.get(ours, ours)
            if (ind, theirs, "x") not in table.columns or (ind, theirs, "y") not in table.columns:
                missing.append(f"{ours} (looked for '{theirs}')")
                continue
            cols[m, k, 0] = table.columns[(ind, theirs, "x")]
            cols[m, k, 1] = table.columns[(ind, theirs, "y")]
            cols[m, k, 2] = table.columns.get((ind, theirs, "likelihood"), -1)
        if missing:
            raise ConversionError(
                f"animal '{ind}' is missing body parts: {', '.join(missing)}. "
                f"Its body parts are {table.bodyparts[ind]}; map them with --map, e.g. --map nose=snout"
            )

    rows = table.rows
    a = int(round(start_s * fps))
    b = len(rows) if seconds is None else min(len(rows), a + int(round(seconds * fps)))
    if a < 0 or a >= b:
        raise ConversionError(f"--start/--seconds select no frames (the file has {len(rows)} frames)")
    rows = rows[a:b]

    kp = np.full((len(rows), 2, len(KEYPOINT_NAMES), 2), np.nan)
    for t, row in enumerate(rows):
        for m in range(2):
            for k in range(len(KEYPOINT_NAMES)):
                x, y = _cell(row, cols[m, k, 0]), _cell(row, cols[m, k, 1])
                lik_col = cols[m, k, 2]
                lik = _cell(row, lik_col) if lik_col >= 0 else 1.0
                if np.isfinite(x) and np.isfinite(y) and not (lik < min_likelihood):
                    kp[t, m, k] = (round(x, 1), round(y, 1))

    missing = np.isnan(kp[..., 0])
    warnings: List[str] = []
    n = len(kp)
    duration = n / fps
    if n > MAX_FRAMES:
        warnings.append(f"{n} frames is over the backend's {MAX_FRAMES}-frame limit; trim with --start/--seconds.")
    if duration < MIN_DURATION_S:
        warnings.append(f"only {duration:.1f} s of data; the backend needs at least {MIN_DURATION_S:g} s.")
    if missing.any():
        warnings.append(
            f"{missing.mean():.1%} of points are missing or below likelihood {min_likelihood:g} (written as [null, null])."
        )
    if missing.all(axis=0).any():
        m, k = np.argwhere(missing.all(axis=0))[0]
        warnings.append(f"'{KEYPOINT_NAMES[k]}' of {mice[m]} is missing in every frame; the backend will reject this file.")
    else:
        gaps = _long_gaps(missing)
        if gaps:
            warnings.append(
                f"{gaps} gap(s) of more than {MAX_GAP_FRAMES} missing frames; the backend rejects those. "
                "Try a lower --min-likelihood or a cleaner stretch of video."
            )
    with np.errstate(invalid="ignore"):
        body = np.linalg.norm(kp[:, :, NOSE] - kp[:, :, TAIL], axis=-1)
    if np.isfinite(body).any():
        med = float(np.nanmedian(body))
        if not BODY_LEN_TYPICAL[0] <= med <= BODY_LEN_TYPICAL[1]:
            warnings.append(
                f"median nose-to-tail length is {med:.0f} px; the training videos are "
                f"{BODY_LEN_TYPICAL[0]:g} to {BODY_LEN_TYPICAL[1]:g} px, so expect a scale warning or rejection."
            )

    def point(x: float, y: float):
        # A lost point is [null, null], the form backend/validation.py accepts and repairs.
        return [None, None] if np.isnan(x) else [float(x), float(y)]

    frames = [
        {"mice": [{name: point(*kp[t, m, k]) for k, name in enumerate(KEYPOINT_NAMES)} for m in range(2)]}
        for t in range(n)
    ]
    return Result({"frame_rate": float(fps), "frames": frames}, n, warnings)


def to_bytes(data: dict) -> bytes:
    return json.dumps(data, separators=(",", ":")).encode()


# ---------------------------------------------------------------- command line

def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().split("\n\n")[0])
    ap.add_argument("csv", type=Path, help="multi-animal DeepLabCut CSV")
    ap.add_argument("-o", "--out", type=Path, help="output keypoints JSON")
    ap.add_argument("--fps", type=float, help="video frame rate (DeepLabCut CSVs don't record it)")
    ap.add_argument("--map", help="body-part names, app_name=dlc_name, comma separated, e.g. nose=snout")
    ap.add_argument("--resident", help="animal to use as the resident, mice[0] (default: first animal)")
    ap.add_argument("--intruder", help="animal to use as the intruder, mice[1] (default: second animal)")
    ap.add_argument("--min-likelihood", type=float, default=DEFAULT_MIN_LIKELIHOOD,
                    help=f"points below this DeepLabCut likelihood become null (default {DEFAULT_MIN_LIKELIHOOD})")
    ap.add_argument("--start", type=float, default=0.0, help="start offset in seconds")
    ap.add_argument("--seconds", type=float, help="keep only this many seconds")
    ap.add_argument("--list", action="store_true", help="print the animals and body parts in the CSV and exit")
    args = ap.parse_args(argv)

    try:
        table = read_dlc_csv(args.csv)
        if args.list:
            print(f"{len(table.rows)} frames")
            for ind in table.individuals:
                print(f"{ind}: {', '.join(table.bodyparts[ind])}")
            return 0
        if args.out is None or args.fps is None:
            ap.error("-o/--out and --fps are required (or use --list)")
        result = convert(
            table, args.fps, parse_map(args.map), args.resident, args.intruder,
            args.min_likelihood, args.start, args.seconds,
        )
    except (ConversionError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    payload = to_bytes(result.data)
    if len(payload) > MAX_UPLOAD_BYTES:
        result.warnings.append(
            f"output is {len(payload) / 2**20:.1f} MiB, over the app's 4 MiB upload limit; "
            "use --seconds to keep a shorter stretch."
        )
    result.warnings.append(
        "the model was trained on one camera setup (CalMS21, 1024x570 px); other setups may get worse labels."
    )
    args.out.write_bytes(payload)
    print(f"wrote {args.out} ({len(payload) / 1e6:.2f} MB, {result.n_frames} frames, "
          f"{result.n_frames / args.fps:.1f} s at {args.fps:g} fps)")
    for w in result.warnings:
        print(f"warning: {w}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
