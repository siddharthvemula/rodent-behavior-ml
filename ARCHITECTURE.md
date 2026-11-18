# Architecture

## Stack
- Frontend: React (Vite), deployed on Vercel.
- Backend: FastAPI, deployed on Vercel's Python runtime (or Vercel Services for a private backend bound to the frontend).
- Model: lightweight sequence classifier (GRU/LSTM or small transformer) on pose keypoints, not raw video.

## Folder structure
```
/frontend          React app
/backend           FastAPI app
/ml                dataset loading, training scripts, saved model artifacts (not committed, see .gitignore)
PROJECT_PLAN.md
ARCHITECTURE.md
```

## API contract (lock before writing feature code, edit this instead of redebating it elsewhere)
- `POST /predict` — input: video file or pre-extracted keypoints. Output: ordered list of {start_time, end_time, behavior_label, confidence}.
- `POST /compare` — input: two videos/keypoint sets (control, treated). Output: per-behavior frequency for each, plus the difference.
- Inference runs as a background job, not inline in the request (Vercel functions time out on long-running work).

## Data schema
- Input: pose keypoints per frame (from the dataset's existing tracking, not re-derived).
- Output: timestamped behavior labels, confidence scores.
