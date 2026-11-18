"""Download the yohimbine open-field pose data (Zenodo 8188683, CC BY 4.0).

Fetches only data.zip (DeepLabCut pose CSVs, ~514 MB) and METADATA_ROCHE.csv,
never Videos.zip (10 GB). Output goes to pharmacology/data/ (git-ignored).

    python pharmacology/download_data.py
"""

import urllib.request
import zipfile
from pathlib import Path

BASE = "https://zenodo.org/records/8188683/files"
OUT = Path(__file__).resolve().parent / "data"


def fetch(name: str) -> Path:
    dest = OUT / name
    if dest.exists():
        print(f"have {name}")
        return dest
    print(f"downloading {name} ...")
    urllib.request.urlretrieve(f"{BASE}/{name}", dest)
    return dest


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    fetch("METADATA_ROCHE.csv")
    archive = fetch("data.zip")
    with zipfile.ZipFile(archive) as z:
        z.extractall(OUT)
    print(f"done: {OUT}")


if __name__ == "__main__":
    main()
