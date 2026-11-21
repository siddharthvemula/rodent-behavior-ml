# /ml

Owner: krishtotala105

Dataset loading, preprocessing, training, and the trained model. This is where the actual behavior classifier gets built.

## Status (Nov 18)
Real-data work is underway (issue #1): **CalMS21 Task 1 only**, four labels (`attack`, `investigation`, `mount`, `other`), dyadic two-mouse schema (see `../ARCHITECTURE.md` "Data schema"). Plan: scikit-learn baseline on engineered dyad features first, a GRU/1D-CNN only if its macro-F1 is poor. Training runs on Colab/Kaggle (no torch/GPU locally).

Done (baseline, `ml/baseline-model` PR):
- `download_data.py`, `preprocess.py`: see below. 
- `features.py`: 391 per-frame features (feature set `v2`, the default) from keypoints only (no tracker scores, since uploads don't have them): per-mouse body shape/speed/acceleration/turning/bend, dyad distances/facing/approach, where each mouse is in the other's body frame (forward/lateral), each with rolling mean/std at 0.17 s, 0.5 s and 1.5 s, plus 1 s past/future/trend and 3 s context for the key distance/speed/facing features. The original 210 are still available as `feature_set="v1"`. Rotation- and translation-invariant (tested); no absolute arena position.
- `model.py`: `HistGradientBoostingClassifier` (class-balanced) + probability smoothing (31 frames ~1 s). The artifact (`model.joblib`, 1.8 MB) is loaded only by the exact scikit-learn version that trained it (1.7.1, pinned in `requirements.txt`; `load_model` refuses a mismatch).
- `train.py`: grouped CV on train, 3-seed fit, one evaluation on the official test split, controls, writes `model.joblib` and `metrics.json`. Retrain with a Python 3.10+ venv matching `requirements.txt`.
- `inference.py`: `predict_behaviors(keypoints, frame_rate)` and `compare_behaviors(control, treated, ...)`, same output shapes the backend already expects. Resamples any frame rate to 30 Hz; ~0.1 s for a 3,000-frame upload.
- `cv_eval.py`: the development loop, repeated recording-level CV on train only with bootstrap CIs and paired comparisons (see "Improving the model" below). Never reads the test split.
- `tests/` (88 tests, run in CI).

## Baseline results (`metrics.json`, CalMS21 Task 1)
| | macro-F1 | attack | investigation | mount | other |
| --- | --- | --- | --- | --- | --- |
| 5-fold grouped CV on train (pooled) | 0.858 (per fold 0.854 +- 0.011) | 0.752 | 0.862 | 0.873 | 0.942 |
| **Test** (official split, 3 seeds) | **0.887** (95% CI over the 19 recordings 0.859-0.906) | 0.825 | 0.849 | 0.924 | 0.952 |
| control: always predict `other` | 0.187 | | | | |
| control: model trained on shuffled labels | 0.238 | | | | |

Mean F1 over the three behaviors excluding `other`: 0.866 on test. Frame-level F1, not segment-level.

Caveats, read these before quoting a number:
- Test (0.887) is higher than CV (0.858), probably because test has a different class mix (mount is 12% of test vs 5.6% of train and it is the easiest class). Don't assume test is "better"; quote both.
- The 3 test seeds only vary which random half of the frames is used for training, so their spread (~0.001) understates real variance. The CV fold spread (+- 0.011) is the better error bar, and 19 test recordings is a small sample: a bootstrap over recordings gives a test macro-F1 95% CI of 0.859-0.906, and only 5 of the 19 test recordings contain any `attack`. Differences under about 0.02 on test are not distinguishable from noise.
- Hyperparameters, feature set and the smoothing window were all chosen on train-only CV, never on test. Smoothing helps in CV (+0.003, paired CI excludes 0) but not on test (0.887 vs 0.894 unsmoothed, a difference inside the test noise); we kept it because the choice was made on CV and the test split is only looked at once.
- `attack` is the weakest class (CV F1 0.75), confused mostly with `investigation` (attack precision 0.77 vs recall 0.88 on test: the model over-calls attack). About 44% of all test errors are within 5 frames of a true label boundary, so much of the remaining error is annotation-timing ambiguity, not something features will fix. A GRU variant was tried separately and did not beat this model, so no sequence model is planned.
- Per-recording behavior frequencies (what the compare view diffs) track ground truth closely on test: Pearson r 0.98-0.99, mean abs error 1-3 points of time fraction.
- CalMS21 has no real treatment labels; the compare view diffs two arbitrary recordings.

Per the plan, a GRU/1D-CNN is only warranted if this macro-F1 were bad. It is not, so this model ships.

Backend and frontend are migrated to this model (`backend/ml_model/` is a copy, enforced by `backend/tests/test_ml_sync.py`).

### Improving the model (Nov 20): what was tried
Goal was test macro-F1 above 0.90. Result: **0.887 test (was 0.886), CV 0.858 (was 0.850). Not reached.** Everything was chosen with `cv_eval.py` (3 repeats x 5 recording-level folds on train, same folds for every config, paired bootstrap over recordings) and the test split was evaluated once, at the end.

| Change | CV macro-F1 vs previous | Kept? |
| --- | --- | --- |
| v2 features (391, was 210) | 0.8503 -> 0.8578, **+0.0076**, paired 95% CI [+0.0018, +0.0140] | yes |
| Viterbi, min-bout filter, per-class windows, other window sizes | best +0.0006, CI includes 0 | no |
| attack class weight x0.5 / x0.75 / x1.5 | -0.0013 / -0.0003 / +0.0003, all within noise | no |
| 4 hyperparameter configs (leaves, regularization, learning rate) | -0.0018 to +0.0008, all within noise | no |
| LightGBM / XGBoost | not tried (expected gain small, adds a backend dependency) | n/a |

The v2 gain is mostly `attack` (CV F1 0.734 -> 0.756). Investigation<->other confusion (~13k and ~20k CV frames) did not move. Test moved only +0.001, inside the test noise (CI +-0.025), so the CV result is the better evidence that v2 is an improvement. A GRU variant was tried separately and lost to this model.

Reproduce: `python ml/cv_eval.py run --name v2` (then `report`, `compare --a baseline --b v2`, `postproc --name v2`); `--feature-set v1` gives the baseline. Out-of-fold probabilities are cached in the gitignored `data/processed/cv/`.

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

### Updating the backend after retraining
1. Keep `predict_behaviors` / `compare_behaviors` signatures in `inference.py` (the backend calls them).
2. `cp ml/{features,model,preprocess,inference}.py ml/model.joblib backend/ml_model/` (CI fails if you forget). See `backend/ml_model/inference.py`'s docstring for why that duplication exists (Vercel Services builds `backend/` independently from `ml/`).

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
  export_clip.py     # slice a CalMS21 recording into an upload-ready JSON for demos
  export_demo_clips.py  # precompute predictions + annotations for two test-split clips (guided demo data)
  tests/             # pytest, run in CI
```

## Output contract
`inference.py` must return results in the shape `/backend/main.py`'s response models expect an ordered list of `{start_time, end_time, behavior_label, confidence}` for predict, and `{control, treated, difference}` frequency dicts for compare. Check `../ARCHITECTURE.md` and `../backend/main.py` before changing that shape, the backend and frontend are already built against it.
