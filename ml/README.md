# /ml

Owner: krishtotala105

Dataset loading, preprocessing, training, and the trained model. This is where the actual behavior classifier gets built.

## Status (Nov 18)
Real-data work is underway (issue #1): **CalMS21 Task 1 only**, four labels (`attack`, `investigation`, `mount`, `other`), dyadic two-mouse schema (see `../ARCHITECTURE.md` "Data schema"). Plan: scikit-learn baseline on engineered dyad features first, a GRU/1D-CNN only if its macro-F1 is poor. Training runs on Colab/Kaggle (no torch/GPU locally).

Done:
- `download_data.py`: fetches `task1_classic_classification.zip` (457,357,950 bytes), verifies size and zip CRCs, extracts only `calms21_task1_{train,test}.json` into `data/raw/calms21/`.
- `preprocess.py`: new schema, upload parser (`parse_keypoints_json`), CalMS21 loader (`load_calms21`), by-recording train/val split, and a compact `.npz` cache (`python ml/preprocess.py` -> `data/processed/`, ~94 MB for both splits, easy to upload to Colab).
- `tests/`: loader + upload-contract tests (run in CI).

Not done yet (step 3+): feature extraction, `model.py`, `train.py`, `inference.py`.

**Currently broken on purpose:** `model.py`, `train.py` and `inference.py` here are still the old synthetic placeholder (single animal, 3 keypoints, `grooming`/`rearing` labels) and `train.py`/`inference.py` no longer import (they use the removed `Frame`/`extract_features`). They get rewritten next. The deployed backend is unaffected: it has its own copy in `backend/ml_model/`, which keeps working until the real model replaces it.

### Quick start
```
python ml/download_data.py          # ~457 MB download, needs ~6 GB free while extracting
python ml/preprocess.py             # JSON (1.7 GB, ~2.5 GB RAM) -> data/processed/*.npz
pytest ml/tests
```

### What the data looks like (verified on the real files)
| | recordings | frames | attack | investigation | mount | other |
| --- | --- | --- | --- | --- | --- | --- |
| train | 70 | 507,738 | 2.8% | 28.9% | 5.6% | 62.7% |
| test | 19 | 262,107 | 4.8% | 23.4% | 12.2% | 59.7% |

30 Hz, 1024x570 px, 7 keypoints per mouse, mouse 0 = resident, mouse 1 = intruder. Report **macro-F1 and per-class F1**, never plain accuracy (`other` is ~60%). Note the train/test class balance differs (mount 5.6% -> 12.2%, attack 2.8% -> 4.8%), so validation scores from a split of train will not exactly predict test. Train/test are split by animal identity, so always split by recording, never by frame.

When the real model is ready, replacing the placeholder means:
1. Keep `predict_behaviors` / `compare_behaviors` signatures in `inference.py` (the backend calls them).
2. Copy `model.py`, `preprocess.py`, `inference.py` and the model artifact into `backend/ml_model/`, overwriting the placeholder copies. See `backend/ml_model/inference.py`'s docstring for why that duplication exists (Vercel Services builds `backend/` independently from `ml/`).

## Dataset
[CalMS21](https://data.caltech.edu/records/s0vdx-0k302) Task 1 (classic classification). Cite the CalMS21 paper (Sun et al., 2021, "The Multi-Agent Behavior Dataset: Mouse Dyadic Social Interactions"). The Caltech record lists it as CC BY 4.0; we stay non-commercial regardless. Never commit the raw data (`/data/raw/` and `/data/processed/` are gitignored). MABe22 was dropped, see `../ARCHITECTURE.md`.

## Layout
```
/ml
  download_data.py   # fetches CalMS21 Task 1 into gitignored data/raw/calms21/
  preprocess.py      # schema, upload parser, CalMS21 loader, splits, .npz cache
  model.py           # (placeholder, to be replaced)
  train.py           # (placeholder, to be replaced)
  inference.py       # (placeholder, to be replaced)
  tests/             # pytest, run in CI
```

## Output contract
`inference.py` must return results matching exactly what `/backend/main.py`'s mocked `_mock_predict_result()` and `_mock_compare_result()` return right now, an ordered list of `{start_time, end_time, behavior_label, confidence}` for predict, and `{control, treated, difference}` frequency dicts for compare. Check `../ARCHITECTURE.md` and `../backend/main.py` before changing that shape, the backend and frontend are already built against it.
