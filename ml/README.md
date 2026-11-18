# /ml

Owner: krishtotala105

Dataset loading, preprocessing, training, and the trained model. This is where the actual behavior classifier gets built.

## Status (Nov 18)
Real-data work is underway (issue #1): **CalMS21 Task 1 only**, four labels (`attack`, `investigation`, `mount`, `other`), dyadic two-mouse schema (see `../ARCHITECTURE.md` "Data schema"). Plan: scikit-learn baseline on engineered dyad features first, a GRU/1D-CNN only if its macro-F1 is poor. Training runs on Colab/Kaggle (no torch/GPU locally).

Done (baseline, `ml/baseline-model` PR):
- `download_data.py`, `preprocess.py`: see below. 
- `features.py`: 210 per-frame features from keypoints only (no tracker scores, since uploads don't have them): per-mouse body shape/speed/turning, dyad distances/facing/approach, each with rolling mean/std at 0.17 s, 0.5 s and 1.5 s. Rotation- and translation-invariant (tested); no absolute arena position.
- `model.py`: `HistGradientBoostingClassifier` (class-balanced) + probability smoothing (31 frames ~1 s). The artifact (`model.joblib`, 1.6 MB) is loaded only by the exact scikit-learn version that trained it (1.7.1, pinned in `requirements.txt`; `load_model` refuses a mismatch).
- `train.py`: grouped CV on train, 3-seed fit, one evaluation on the official test split, controls, writes `model.joblib` and `metrics.json`. Retrain with a Python 3.10+ venv matching `requirements.txt`.
- `inference.py`: `predict_behaviors(keypoints, frame_rate)` and `compare_behaviors(control, treated, ...)`, same output shapes the backend already expects. Resamples any frame rate to 30 Hz; ~0.05 s for a 3,000-frame upload.
- `tests/` (55 tests, run in CI).

## Baseline results (`metrics.json`, CalMS21 Task 1)
| | macro-F1 | attack | investigation | mount | other |
| --- | --- | --- | --- | --- | --- |
| 5-fold grouped CV on train (pooled) | 0.852 (per fold 0.846 +- 0.014) | 0.737 | 0.858 | 0.872 | 0.941 |
| **Test** (official split, 3 seeds) | **0.886** | 0.819 | 0.850 | 0.923 | 0.952 |
| control: always predict `other` | 0.187 | | | | |
| control: model trained on shuffled labels | 0.238 | | | | |

Mean F1 over the three behaviors excluding `other`: 0.864 on test. Frame-level F1, not segment-level.

Caveats, read these before quoting a number:
- Test (0.886) is higher than CV (0.846), probably because test has a different class mix (mount is 12% of test vs 5.6% of train and it is the easiest class). Don't assume test is "better"; quote both.
- The 3 test seeds only vary which random half of the frames is used for training, so their spread (~0.001) understates real variance. The CV fold spread (+- 0.014) is the better error bar, and 19 test recordings is a small sample.
- Hyperparameters (three configs, all within 0.003) and the smoothing window were chosen on train-only CV. Smoothing helped in CV (+0.007) but not on test (0.886 vs 0.890 unsmoothed), so it is a wash.
- `attack` is the weakest class (CV F1 0.74), confused mostly with `investigation`. This is the obvious place a sequence model could help.
- Per-recording behavior frequencies (what the compare view diffs) track ground truth closely on test: Pearson r 0.98-0.99, mean abs error 1-3 points of time fraction.
- CalMS21 has no real treatment labels; the compare view diffs two arbitrary recordings.

Per the plan, a GRU/1D-CNN is only warranted if this macro-F1 were bad. It is not, so the baseline ships.

Not done yet: migrate `backend/ml_model/`, backend tests, mock data and the frontend to this model (the backend still serves the old placeholder; see "Replacing the placeholder" below).

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

### Replacing the placeholder in the backend (next PR)
1. Keep `predict_behaviors` / `compare_behaviors` signatures in `inference.py` (the backend calls them).
2. Copy `features.py`, `model.py`, `preprocess.py`, `inference.py` and `model.joblib` into `backend/ml_model/`, overwriting the placeholder copies. See `backend/ml_model/inference.py`'s docstring for why that duplication exists (Vercel Services builds `backend/` independently from `ml/`).

## Dataset
[CalMS21](https://data.caltech.edu/records/s0vdx-0k302) Task 1 (classic classification). Cite the CalMS21 paper (Sun et al., 2021, "The Multi-Agent Behavior Dataset: Mouse Dyadic Social Interactions"). The Caltech record lists it as CC BY 4.0; we stay non-commercial regardless. Never commit the raw data (`/data/raw/` and `/data/processed/` are gitignored). MABe22 was dropped, see `../ARCHITECTURE.md`.

## Layout
```
/ml
  download_data.py   # fetches CalMS21 Task 1 into gitignored data/raw/calms21/
  preprocess.py      # schema, upload parser, CalMS21 loader, splits, .npz cache
  features.py        # per-frame features from keypoints
  model.py           # classifier, smoothing, (de)serialization
  train.py           # CV + fit + test evaluation, writes model.joblib/metrics.json
  inference.py       # predict_behaviors / compare_behaviors (what the backend calls)
  model.joblib, metrics.json
  tests/             # pytest, run in CI
```

## Output contract
`inference.py` must return results matching exactly what `/backend/main.py`'s mocked `_mock_predict_result()` and `_mock_compare_result()` return right now, an ordered list of `{start_time, end_time, behavior_label, confidence}` for predict, and `{control, treated, difference}` frequency dicts for compare. Check `../ARCHITECTURE.md` and `../backend/main.py` before changing that shape, the backend and frontend are already built against it.
