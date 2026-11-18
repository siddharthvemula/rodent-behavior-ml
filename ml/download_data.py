"""
Downloads CalMS21 Task 1 (classic classification) into a local, gitignored
data/raw/ directory. Never commit the raw data (see .gitignore).

Source: https://data.caltech.edu/records/s0vdx-0k302
Cite the CalMS21 paper (Sun et al., 2021) if you use this data.

Only the one ~457 MB zip is fetched, not the 28-74 GB video archives or the
MARS/taskprog feature archives. Only the keypoint JSON files are extracted.

Run from anywhere:  python ml/download_data.py [--data-dir PATH] [--keep-zip]

Stdlib only on purpose (no requests/tqdm) so it runs on Colab/Kaggle with no
installs. Safe to re-run: skips work that is already done.
"""
import argparse
import hashlib
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

RECORD = "s0vdx-0k302"
ZIP_NAME = "task1_classic_classification.zip"
URL = f"https://data.caltech.edu/records/{RECORD}/files/{ZIP_NAME}?download=1"

# Exact size reported by the server (Content-Range) on 2026-11-18. A mismatch
# means a truncated/changed file; the download itself is also checked against
# Content-Length, and the zip's own CRCs are checked before extracting.
EXPECTED_ZIP_BYTES = 457_357_950

# CaltechDATA's CDN (Cloudflare) returns 403 for Python's default urllib
# User-Agent, so send a generic client name.
USER_AGENT = "calms21-downloader/1.0"
# Unzipped JSON is several times the zip size; refuse to start without headroom.
MIN_FREE_BYTES = 6 * 1024**3

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = REPO_ROOT / "data" / "raw" / "calms21"


def _human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def download(url: str, dest: Path) -> None:
    """Stream url to dest via a .part file; urllib follows the redirect to
    Caltech's signed storage URL. Verifies the byte count against the server's
    Content-Length so a truncated download fails loudly."""
    part = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        with open(part, "wb") as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r  {_human(done)} / {_human(total)} ({done / total:.0%})", end="", flush=True)
        print()
    if total and done != total:
        part.unlink(missing_ok=True)
        raise RuntimeError(f"truncated download: got {done} bytes, expected {total}")
    part.rename(dest)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def extract_keypoint_jsons(zip_path: Path, out_dir: Path) -> list[Path]:
    """Extract only calms21_*.json (keypoints/scores/annotations), flattened
    into out_dir. Skips taskprog_features_*.json (precomputed features we
    don't use). Guards against zip-slip by only using each member's basename."""
    extracted = []
    with zipfile.ZipFile(zip_path) as zf:
        bad = zf.testzip()
        if bad:
            raise RuntimeError(f"corrupt zip member: {bad}")
        for info in zf.infolist():
            name = Path(info.filename).name
            if info.is_dir() or not (name.startswith("calms21_") and name.endswith(".json")):
                continue
            target = out_dir / name
            if target.exists() and target.stat().st_size == info.file_size:
                print(f"  already extracted: {name}")
            else:
                print(f"  extracting {name} ({_human(info.file_size)})")
                with zf.open(info) as src, open(target, "wb") as dst:
                    shutil.copyfileobj(src, dst)
            extracted.append(target)
    return extracted


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR,
                    help=f"where to put the data (default: {DEFAULT_DATA_DIR})")
    ap.add_argument("--keep-zip", action="store_true", help="don't delete the zip after extracting")
    args = ap.parse_args()

    out_dir: Path = args.data_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = out_dir / ZIP_NAME

    existing = sorted(out_dir.glob("calms21_*.json"))
    if existing and not zip_path.exists():
        print(f"Already have {len(existing)} CalMS21 JSON file(s) in {out_dir}, nothing to do.")
        return 0

    free = shutil.disk_usage(out_dir).free
    if not zip_path.exists() and free < MIN_FREE_BYTES:
        print(f"Only {_human(free)} free in {out_dir}; need ~{_human(MIN_FREE_BYTES)} "
              f"(zip + extracted JSON). Free up space or pass --data-dir elsewhere.", file=sys.stderr)
        return 1

    if zip_path.exists():
        print(f"Using existing {zip_path.name}")
    else:
        print(f"Downloading {ZIP_NAME} (~{_human(EXPECTED_ZIP_BYTES)}) from CaltechDATA...")
        download(URL, zip_path)

    size = zip_path.stat().st_size
    if size != EXPECTED_ZIP_BYTES:
        print(f"Unexpected zip size {size} bytes (expected {EXPECTED_ZIP_BYTES}); "
              f"delete {zip_path} and retry (or update EXPECTED_ZIP_BYTES if Caltech re-uploaded it).",
              file=sys.stderr)
        return 1
    print(f"  sha256 {sha256(zip_path)}  (record this if you want to pin it)")

    files = extract_keypoint_jsons(zip_path, out_dir)
    if not files:
        print("No calms21_*.json files found in the zip; layout may have changed.", file=sys.stderr)
        return 1

    if not args.keep_zip:
        zip_path.unlink()
        print(f"Removed {ZIP_NAME} (use --keep-zip to keep it)")

    print(f"Done. {len(files)} file(s) in {out_dir}:")
    for f in files:
        print(f"  {f.name}  {_human(f.stat().st_size)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
