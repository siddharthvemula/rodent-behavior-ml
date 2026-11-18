# Backend

FastAPI service implementing the API contract in `../ARCHITECTURE.md`.

## Run locally
```
pip install -r requirements.txt
uvicorn main:app --reload
```

## Endpoints
- `POST /predict` - upload one video/keypoint file, get a job id back, poll `/jobs/{job_id}` for the behavior timeline.
- `POST /compare` - upload a control file and a treated file, get a job id back, poll `/jobs/{job_id}` for the frequency comparison.
- `GET /jobs/{job_id}` - job status and result once ready.
- `GET /health` - liveness check.

Model inference is currently mocked (see `_mock_predict_result` / `_mock_compare_result` in `main.py`) so frontend and ML work aren't blocked on each other. Swap those for real calls into `/ml` once the model is ready, keep the response shape identical.
