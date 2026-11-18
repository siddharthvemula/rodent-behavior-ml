# /frontend

Owner: mehulvar

React app (use Vite). Two views are required per the root `PROJECT_PLAN.md`:
1. Upload or select a video, see the predicted behavior timeline.
2. Select two recordings (A and B), see a side-by-side behavior-frequency comparison. This compares behavior between recordings and does not claim any treatment effect.

## Scaffold
```
npm create vite@latest . -- --template react
```
(run from inside this `/frontend` folder)

## API contract
See root `ARCHITECTURE.md`. The backend is already live with mocked responses matching this schema (see `/backend/main.py`), build and test against it now rather than waiting on the real model:
- `POST /predict` with a video file → `{job_id, status, result}`, poll `GET /jobs/{job_id}` if status isn't `done` yet.
- `POST /compare` with `control` and `treated` files → same job/poll pattern, result is `{control, treated, difference}` frequency dicts.

## Deploy
This repo is already linked to Vercel. Once this folder has a `package.json`, Vercel and CI will pick it up automatically on the next push to `main`.
