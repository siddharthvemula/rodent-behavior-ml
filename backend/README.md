# Backend

FastAPI service implementing the API contract in `../ARCHITECTURE.md`.

## Run locally
```
pip install -r requirements.txt
uvicorn main:app --reload
```

## Endpoints
All routes are under `/api` (see `../vercel.json`, which routes `/api/*` here and everything else to the frontend, same origin, no CORS needed).
- `POST /api/predict` - upload one keypoints JSON file, get a job id back, poll `/api/jobs/{job_id}` for the behavior timeline.
- `POST /api/compare` - upload a control file and a treated file, get a job id back, poll `/api/jobs/{job_id}` for the frequency comparison.
- `GET /api/jobs/{job_id}` - job status and result once ready.
- `GET /api/health` - liveness check.

## Model
`ml_model/` holds the CalMS21-trained classifier (labels `attack`, `investigation`, `mount`, `other`). It is a copy of the matching files in `../ml/`; `tests/test_ml_sync.py` fails if they drift. To update it after retraining in `ml/`:
```
cp ml/{features,model,preprocess,inference}.py ml/model.joblib backend/ml_model/
```
Uploads must be keypoints JSON in the schema in `../ARCHITECTURE.md` ("Data schema"); malformed ones get a 422, and anything that isn't keypoints JSON (e.g. a raw video, which can't be classified yet because there is no pose extraction) gets a 415. There are no mock results. To make real demo clips from CalMS21 locally: `python ml/export_clip.py --help`.
