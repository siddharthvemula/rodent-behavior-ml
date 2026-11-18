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

## Data schema
- Input: pose keypoints per frame (from the dataset's existing tracking, not re-derived).
- Output: timestamped behavior labels, confidence scores.
