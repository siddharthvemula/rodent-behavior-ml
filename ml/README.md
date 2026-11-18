# /ml

Owner: krishtotala105

Dataset loading, preprocessing, training, and the trained model. This is where the actual behavior classifier gets built.

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
