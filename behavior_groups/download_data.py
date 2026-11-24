"""Download the InvincibleJellyfish files of DANDI 000564 (Days of our Mice, DooM).

Archive: EMBER-DANDI, version 0.261015.2324 (pinned; the files are verified against the sizes the archive lists).
License: CC-BY-NC-SA-4.0 (non-commercial, share-alike). Only this one lab's folder is fetched, never the MP4s.

Fetches, into behavior_groups/data/ (git-ignored):
  videos.csv                         per-video metadata, including the group label (mouse1_condition)
  <video_id>.annotation.pkt          human-scored bouts (Parquet)
  <video_id>.tracking.pkt            pose (Parquet); read ONLY for the frame range each video covers
  <video_id>.slp                     SLEAP file; read ONLY for the provenance record of bout-time corrections

    python behavior_groups/download_data.py [out_dir]
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api-dandi.emberarchive.org/api/dandisets/000564/versions/0.261015.2324"
DOWNLOAD = "https://api-dandi.emberarchive.org/api/assets/{}/download/"
LAB = "InvincibleJellyfish"
SUFFIXES = (".annotation.pkt", ".tracking.pkt", ".slp")
OUT = Path(__file__).resolve().parent / "data"
RETRIES = 6


def _get_json(url: str):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def list_assets(pattern: str) -> list:
    out, url = [], f"{API}/assets/?page_size=1000&glob={urllib.parse.quote(pattern)}"
    while url:
        page = _get_json(url)
        out += [(a["path"], a["size"], a["asset_id"]) for a in page["results"]]
        url = page["next"]
    return out


def fetch(asset_id: str, size: int, dest: Path) -> None:
    """Download to a temporary name, check the byte count, then rename, so an interrupted
    transfer can never be mistaken for a finished file. Retries on dropped connections."""
    if dest.exists() and dest.stat().st_size == size:
        return
    tmp = dest.with_name(dest.name + ".part")
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(DOWNLOAD.format(asset_id), timeout=120) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            if tmp.stat().st_size != size:
                raise OSError(f"{dest.name}: got {tmp.stat().st_size} bytes, archive lists {size}")
            tmp.replace(dest)
            return
        except OSError as exc:  # URLError and ConnectionError are OSErrors
            if attempt == RETRIES - 1:
                raise
            print(f"  retry {dest.name} ({exc})")
            time.sleep(2 * (attempt + 1))


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    out.mkdir(parents=True, exist_ok=True)
    top = {p: (s, a) for p, s, a in list_assets("videos.csv")}
    size, asset = top["videos.csv"]
    fetch(asset, size, out / "videos.csv")
    files = [x for x in list_assets(f"{LAB}/*") if x[0].endswith(SUFFIXES)]
    if not files:
        raise SystemExit(f"no {LAB} files found in the archive listing")
    from concurrent.futures import ThreadPoolExecutor

    def one(x):
        path, size, asset = x
        fetch(asset, size, out / path.split("/", 1)[1])

    with ThreadPoolExecutor(4) as pool:
        list(pool.map(one, files))
    print(f"done: {len(files)} files + videos.csv in {out}")


if __name__ == "__main__":
    main()
