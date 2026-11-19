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
`vercel.json` routes every `/api/*` request to the backend service and everything else to the frontend. That means all backend routes live under `/api`, not at the root, so the frontend and backend share one origin and no CORS configuration is needed. Production builds of the frontend default to the same-origin `/api`, so no environment variable is needed on Vercel (production or preview); set `VITE_API_BASE_URL` only to point at a different backend. Canned-data mock mode is opt-in (`VITE_USE_MOCK=true`) or dev-only (`npm run dev` with no `VITE_API_BASE_URL`), and always shows a visible "Demo mode" banner. See `configFromEnv` in `frontend/src/api/client.ts`. (Before Nov 18 a deployment missing the variable silently served canned results, which made a Vercel preview look like the backend returned a fake timeline.)

## API contract (lock before writing feature code, edit this instead of redebating it elsewhere)
- `POST /api/predict` — input: a pre-extracted keypoints JSON file (see Data schema; raw video is not supported, there is no pose-extraction step yet). Output: `{job_id, status, result}`, result is an ordered list of `{start_time, end_time, behavior_label, confidence}` once `status` is `done`.
- `POST /api/compare` — input: two keypoints JSON files (`control`, `treated` multipart fields). Output: same job envelope, result is `{control, treated, difference}` per-behavior frequency dicts.
- `GET /api/jobs/{job_id}` — poll until `status` is `done` or `failed`.
- Inference runs as a background job, not inline in the request (Vercel functions time out on long-running work).

**Job envelope (additive fields, Nov 18 hardening, see `HARDENING_PLAN.md`):** every job response may also carry `warnings: string[]` (things the backend repaired or finds suspicious about an upload; empty when clean) and, for compare jobs, `durations: {control, treated}` in seconds and `intervals` (viz Phase 2, Nov 19): `{level: 0.95, control, treated, difference}`, each a `{behavior: [low, high]}` map of fractions of recording time from a seeded circular block bootstrap (~10 s blocks, 500 replicates) over each recording's per-frame labels; `difference` is treated minus control. `intervals` says how stable each recording's own estimate is, not whether two animals or groups differ, and the UI words it that way. Older clients ignore all three; `result` is unchanged. Errors are JSON `{detail: string}`: 400 empty file, 413 over the size limit, 415 not keypoints JSON (video, CSV, raw CalMS21), 422 keypoints JSON that is unusable (reason and location in `detail`), 500 classifier failure (job marked `failed`). `GET /api/health` returns `{status, model_loaded}`, 503 if the model cannot load.

**Upload validation rules** (all in `backend/validation.py`, the model code is untouched): recording at least 3 s and at most 20,000 frames; `frame_rate` 10 to 500 fps (default 30 with a warning); coordinates must be numbers or `null` (a missing point), magnitude at most 1e5; missing points in gaps of up to 5 frames are interpolated (warning), longer gaps are rejected; recordings with no movement are rejected; implausible scale (median nose-to-tail outside 90 to 300 px warns, outside 20 to 800 px rejects) and (0,0) dropout markers warn.

## Known limit: upload size (flagged Nov 17)
Vercel Functions cap every request body at 4.5MB, with no way to raise it, this applies to `/api/predict` and `/api/compare` since they're Vercel Functions. The backend enforces a 4MB per-file limit (`MAX_UPLOAD_BYTES` in `backend/main.py`) and returns a clear 413 instead of a cryptic platform error. A keypoints file should fit comfortably: a 100 s clip (3,000 frames) is ~1.9 MB (`python ml/export_clip.py` makes them from CalMS21). A `rodent-behavior-ml-blob` Vercel Blob store already exists for a proper fix (direct-to-Blob client uploads bypassing this limit entirely), but that needs a small token-minting endpoint and isn't required for Nov 28. Stretch goal if time allows, don't block on it.

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

## Model status (updated Nov 18, migration to the real model)
The backend serves a real model trained on CalMS21 Task 1: a class-balanced scikit-learn `HistGradientBoostingClassifier` over 210 keypoint-only per-frame features, with 1-second probability smoothing (code in `ml/`, copied to `backend/ml_model/`). Test-split macro-F1 is **0.886** (5-fold CV on train: 0.846 +- 0.014); `attack` is the weakest class (F1 0.82 test / 0.74 CV). See `ml/README.md` and `ml/metrics.json` for the full table, controls and caveats. The GRU/LSTM originally planned was not needed.

`backend/ml_model/` is a hand-maintained byte-for-byte copy of `ml/{features,model,preprocess,inference}.py` and `ml/model.joblib` (Vercel builds `backend/` independently, so it can't read `../ml/` at runtime). `backend/tests/test_ml_sync.py` fails CI if they drift.

Upload handling (`backend/main.py`):
- Valid keypoints JSON -> real inference.
- JSON with a `frames` key that doesn't match the schema (including the retired single-animal format) -> **422** with the reason. Never a fabricated result.
- `frame_rate` outside 1-500 -> 422. Any valid rate is resampled to 30 Hz internally.
- Anything that isn't keypoints JSON at all (e.g. a raw video, since there is no pose-extraction step from video to keypoints yet) -> **415** with an explanation. For `/api/compare` the detail names which file (`control` or `treated`) was rejected. The backend never returns made-up results; an earlier stopgap that did was removed on Nov 18.
