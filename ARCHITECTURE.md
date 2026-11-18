# Architecture

## Stack
- Frontend: React (Vite), deployed on Vercel.
- Backend: FastAPI, deployed on Vercel via [Services](https://vercel.com/docs/services): one Vercel project, two services (frontend, backend), sharing one public domain. See `vercel.json` at the repo root.
- Model: classifier on pose keypoints, not raw video. Baseline is scikit-learn on engineered dyad features (safest to deploy on Vercel, small and no torch). Only move to a GRU/1D-CNN if the baseline's macro-F1 is poor; a torch model would also need an ONNX or numpy-only export to fit Vercel's function size limit. Training happens on Colab/Kaggle (no torch/GPU locally).
- Dataset: CalMS21 Task 1 only (see Data schema). MABe22 is out of scope: it's a representation-learning benchmark (3 mice, 12 keypoints, no supervised behavior labels in the challenge), not a fit for the supervised core task.

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

## Data schema (updated Nov 18 for CalMS21 Task 1, replaces the day-one single-animal schema)
- Input: pose keypoints per frame for a two-mouse (dyadic) recording, from the dataset's existing tracking, not re-derived. JSON:
  ```json
  {
    "frame_rate": 30.0,
    "frames": [
      {"mice": [
        {"nose": [x,y], "ear_left": [x,y], "ear_right": [x,y], "neck": [x,y],
         "hip_left": [x,y], "hip_right": [x,y], "tail_base": [x,y]},
        {"nose": [x,y], ...same 7 keys...}
      ]},
      ...
    ]
  }
  ```
  - `mice[0]` is the resident (black) mouse, `mice[1]` is the intruder (white) mouse. Order matters: CalMS21's labels describe behaviors initiated by the resident.
  - 7 keypoints per mouse, in CalMS21's order: nose, left ear, right ear, neck, left hip, right hip, tail base. There is no `center` keypoint anymore (compute it from the hips/neck if a feature needs one).
  - Coordinates are in pixels on CalMS21's 1024x570 frame. `ml/preprocess.py` is responsible for any normalization (centering/scaling); uploaded files should use raw pixel coordinates in this frame.
  - `frame_rate` is assumed to be 30.0 until verified against the CalMS21 paper/readme (the readme doesn't state it). Keep the top-level `{frame_rate, frames}` envelope.
- Output: timestamped behavior labels, confidence scores.
- Behavior labels (CalMS21 Task 1, the only valid values for `behavior_label` and the keys in compare frequency dicts):

  | id | label |
  | --- | --- |
  | 0 | `attack` |
  | 1 | `investigation` |
  | 2 | `mount` |
  | 3 | `other` |

  The old placeholder labels (`grooming`, `rearing`) no longer exist. `other` is the majority class in CalMS21, so evaluate with macro-F1 and per-class F1, never plain accuracy.
- Source data: CalMS21 Task 1 (`task1_classic_classification.zip`, ~457 MB) from [CaltechDATA](https://data.caltech.edu/records/s0vdx-0k302). Cite the CalMS21 paper. Never commit raw data (`/data/raw/` is gitignored). Note the Caltech record page lists CalMS21 as CC BY 4.0, not the CC BY-NC-SA in PROJECT_PLAN.md; we're staying non-commercial and citing regardless.
- Compare semantics: a control-vs-treated comparison is two separate dyadic recordings run through the classifier, diffing label frequencies. CalMS21 has no real treatment labels, so the demo compares two arbitrary recordings and must say so honestly.

## Model status (flagged Nov 17-18, updated Nov 18)
The backend calls a placeholder model (`backend/ml_model/`, scikit-learn) when the upload parses as a keypoints JSON. It is trained on synthetic generated data with the old single-animal, 3-keypoint schema and the old `grooming`/`investigation`/`rearing` labels, so it does not match the schema above and is being replaced. It was built to unblock backend/frontend integration, not as a result. The real data/ML work (GitHub issue #1) is now underway: CalMS21 Task 1, four labels, scikit-learn baseline first, GRU only if macro-F1 is poor. Until the backend and frontend migrate, the placeholder and the new schema are intentionally out of sync; the migration lands as part of the same PR series (preprocess -> model -> backend/tests -> frontend labels). A raw video upload still falls back to the original hardcoded mock, since there's no pose-extraction step from video to keypoints yet. See `ml/README.md` Status section for exactly what replacing it involves.
