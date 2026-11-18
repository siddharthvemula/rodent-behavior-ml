# /ml

Owner: krishtotala105

Dataset loading, preprocessing, training, and the trained model. This is where the actual behavior classifier gets built.

## Status (Nov 17-18)
A placeholder pipeline is in place (preprocess.py, model.py, train.py, inference.py) so the backend has a real model to call instead of hardcoded numbers, done to keep the team moving while this repo had no ML work started yet with the deadline close. It is trained on **synthetic, generated keypoint sequences**, not CalMS21 or MABe22, and uses a scikit-learn RandomForest on hand-crafted features, not the GRU/LSTM originally planned (no GPU/torch and no network access to the real datasets in the environment this was built in). It works end to end (backend calls it, gets real predictions back for a valid keypoints file), but it has learned nothing about real mouse behavior. Don't report its accuracy numbers as a result, they're against synthetic data by construction.

This is not a substitute for the real work below, it's a stand-in to unblock everyone else. Replacing it means:
1. `download_data.py`: actually write it, pull CalMS21/MABe22 for real (not written yet, these notes assume you're starting that now).
2. `preprocess.py`: replace `parse_keypoints_json` (or extend it) to read the real datasets' actual keypoint/label format into frames, and decide whether the simple hand-crafted features in `extract_features` are good enough or whether to feed raw sequences into a real GRU/LSTM/transformer instead (likely the latter, on Colab/Kaggle where torch + GPU exist).
3. `train.py`: replace `simulate_sequence`/`build_synthetic_dataset` with loading the real preprocessed data.
4. `model.py`/`inference.py`: keep the same function signatures (`predict_behaviors`, `compare_behaviors`) so the backend integration doesn't need to change, swap what's inside.
5. Once retrained: copy `model.py`, `preprocess.py`, `inference.py`, and the new `model.joblib` (or equivalent) into `backend/ml_model/`, overwriting the placeholder copies. See `backend/ml_model/inference.py`'s docstring for why that duplication exists (Vercel Services builds `backend/` independently from `ml/`).

## Datasets (see root `PROJECT_PLAN.md` for why these two)
- [CalMS21](https://sites.google.com/view/computational-behavior/our-datasets/calms21-dataset)
- [MABe22 mouse triplets](https://data.caltech.edu/records/rdsa8-rde65)

Both are CC BY-NC-SA: cite the papers, keep this project non-commercial, and never commit the raw dataset here (the root `.gitignore` already excludes `/data/raw/`). Write a download script instead of checking in the files.

## Expected layout
```
/ml
  download_data.py   # fetches datasets into a local, gitignored /data/raw/
  preprocess.py       # builds train/val/test splits from pose keypoints + labels
  model.py            # the sequence classifier (GRU/LSTM or small transformer over keypoints)
  train.py             # training loop
  inference.py         # loads a trained checkpoint, returns predictions in the backend's schema
```

## Output contract
`inference.py` must return results matching exactly what `/backend/main.py`'s mocked `_mock_predict_result()` and `_mock_compare_result()` return right now, an ordered list of `{start_time, end_time, behavior_label, confidence}` for predict, and `{control, treated, difference}` frequency dicts for compare. Check `../ARCHITECTURE.md` and `../backend/main.py` before changing that shape, the backend and frontend are already built against it.
