# Architecture

## Stack
- Frontend: React (Vite), deployed on Vercel.
- Backend: FastAPI, deployed on Vercel via [Services](https://vercel.com/docs/services): one Vercel project, two services (frontend, backend), sharing one public domain. See `vercel.json` at the repo root.
- Model: lightweight sequence classifier (GRU/LSTM or small transformer) on pose keypoints, not raw video.

## Folder structure
```
/frontend          React app
/backend           FastAPI app
/ml                dataset loading, training scripts, saved model artifacts (not committed, see .gitignore)
vercel.json        Services config: routes /api/* to backend, everything else to frontend
PROJECT_PLAN.md
ARCHITECTURE.md
```

## Deployment routing (updated Nov 17, flagging since it changes the paths below)
`vercel.json` routes every `/api/*` request to the backend service and everything else to the frontend. That means all backend routes live under `/api`, not at the root, so the frontend and backend share one origin and no CORS configuration is needed. The frontend's `VITE_API_BASE_URL` must be set to `/api` in the Vercel project's Production environment variables for this to work (falls back to mock mode if unset, see `frontend/src/api/client.ts`).

## API contract (lock before writing feature code, edit this instead of redebating it elsewhere)
- `POST /api/predict` — input: video file or pre-extracted keypoints. Output: `{job_id, status, result}`, result is an ordered list of `{start_time, end_time, behavior_label, confidence}` once `status` is `done`.
- `POST /api/compare` — input: two videos/keypoint sets (`control`, `treated` multipart fields). Output: same job envelope, result is `{control, treated, difference}` per-behavior frequency dicts.
- `GET /api/jobs/{job_id}` — poll until `status` is `done` or `failed`.
- Inference runs as a background job, not inline in the request (Vercel functions time out on long-running work).

## Known limit: upload size (flagged Nov 17)
Vercel Functions cap every request body at 4.5MB, with no way to raise it, this applies to `/api/predict` and `/api/compare` since they're Vercel Functions. The backend enforces a 4MB per-file limit (`MAX_UPLOAD_BYTES` in `backend/main.py`) and returns a clear 413 instead of a cryptic platform error. A pre-extracted keypoints file should comfortably fit; a raw video clip for the demo needs to be short/low-res enough to stay under this, or trimmed first. A `rodent-behavior-ml-blob` Vercel Blob store already exists for a proper fix (direct-to-Blob client uploads bypassing this limit entirely), but that needs a small token-minting endpoint and isn't required for Nov 28. Stretch goal if time allows, don't block on it.

## Data schema
- Input: pose keypoints per frame (from the dataset's existing tracking, not re-derived). Day-one contract (see `ml/preprocess.py`): JSON `{"frame_rate": 30.0, "frames": [{"nose": [x,y], "center": [x,y], "tail_base": [x,y]}, ...]}`. Extend this if the real dataset needs more keypoints or a second animal, keep the top-level `{frame_rate, frames}` shape.
- Output: timestamped behavior labels, confidence scores.

## Model status (flagged Nov 17-18)
The backend calls a real model (`backend/ml_model/`, scikit-learn, not yet the GRU/LSTM this doc originally called for) when the upload parses as the keypoints JSON above. That model is trained on synthetic generated data, not CalMS21/MABe22, it's a placeholder built to unblock backend/frontend integration while the real data/ML work (tracked in GitHub issue #1) was not yet started, not a replacement for it. A raw video upload still falls back to the original hardcoded mock, since there's no pose-extraction step from video to keypoints yet. See `ml/README.md` Status section for exactly what replacing it involves.
