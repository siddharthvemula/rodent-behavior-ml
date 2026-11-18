# Backend

FastAPI service implementing the API contract in `../ARCHITECTURE.md`.

## Run locally
```
pip install -r requirements.txt
uvicorn main:app --reload
```

## Endpoints
All routes are under `/api` (see `../vercel.json`, which routes `/api/*` here and everything else to the frontend, same origin, no CORS needed).
- `POST /api/predict` - upload one video/keypoint file, get a job id back, poll `/api/jobs/{job_id}` for the behavior timeline.
- `POST /api/compare` - upload a control file and a treated file, get a job id back, poll `/api/jobs/{job_id}` for the frequency comparison.
- `GET /api/jobs/{job_id}` - job status and result once ready.
- `GET /api/health` - liveness check.

Model inference is currently mocked (see `_mock_predict_result` / `_mock_compare_result` in `main.py`) so frontend and ML work aren't blocked on each other. Swap those for real calls into `/ml` once the model is ready, keep the response shape identical.
