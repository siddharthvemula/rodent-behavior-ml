# Edge-case hardening plan

Record of what was found, what was changed and why, ahead of the competition demo.
Scope rule: **no change to the trained model, `features.py`, `preprocess.py`, `inference.py` or `model.py`**
(the `backend/ml_model/` copies stay byte-identical to `ml/`, see `backend/tests/test_ml_sync.py`).
All new input checks live in `backend/validation.py`.

## Investigation notes

* The app has **no CSV upload**. `/api/predict` and `/api/compare` take keypoints JSON only. CSV appears only in
  `pharmacology/open_field.py`, an offline script that produced the committed `frontend/src/data/open_field.json`.
* The Pharmacology tab is static (renders that JSON); nothing a user does can break it at demo time.
* Findings were reproduced against the real parse / resample / feature / smoothing / segmenting code with a stub
  classifier (the investigating machine had Python 3.9; the pinned scikit-learn 1.7.1 needs 3.10+). Validation against the
  real model happens in GitHub Actions.
* Training data (CalMS21 Task 1): recordings 3.2 s to 12 min (median 3 min); x 51..963, y 58..551 px; nose-to-tail length
  116..234 px (5th..95th percentile).

## Decisions (approved)

1. Add backward-compatible response fields: top-level `warnings: string[]` on jobs, and `durations: {control, treated}`
   (seconds) on compare jobs.
2. NaN/null keypoints: repair gaps of up to 5 frames by interpolation and warn; reject longer gaps with their location.
3. Minimum recording length: 3 s.
4. Validate against the real pinned model via CI, not a local Python install.

## Findings and fixes

Severity: H likely on stage, M plausible, L minor.

### A. Backend input handling

| # | Sev | Problem | Fix |
|---|---|---|---|
| 1 | H | CalMS21 raw file / CSV / DLC file all get a generic 415 (or a misleading "trim the clip" 413) | Sniff format; tailored 415/413 messages pointing at what is accepted and `ml/export_clip.py` |
| 2 | H | 1-5 frame recordings accepted, return one meaningless "other" segment | Reject under 3 s (422, states actual duration) |
| 3 | M | 500 fps tiny file yields a 0.0 s result | Covered by #2 (duration based) |
| 4 | H | Any NaN/null rejects the whole file, without location | Repair gaps <= 5 frames, warn with count; reject longer gaps with keypoint + frame range |
| 5 | H | All-zero / constant recording accepted, returns confident "100% other" | Reject recordings with no movement; warn if > 5% of points are exactly (0,0) |
| 6 | M | `frame_rate: true` accepted as 1 fps; strings/bools accepted as numbers | Strict numeric typing |
| 7 | M | Huge finite coordinates (3e38) pass parsing, crash featurizing (500 + leaked job) | Reject non-finite / |coord| > 1e5 with location |
| 8 | H | Non-CalMS21 pixel scale accepted silently | Warn when median body length or frame coverage is implausible; reject only egregious (< 20 px or > 800 px). Best effort: moderate scale differences are not detectable from body length alone |
| 9 | M | Frame rate down to 1 fps accepted (interpolated to 30 Hz) | Require >= 10 fps |

### B. Backend robustness

| # | Sev | Problem | Fix |
|---|---|---|---|
| 10 | M | Job created before inference; failure leaves a `queued` job forever; `jobs` unbounded | try/except -> job `failed` + clean JSON 500; cap at 100 jobs |
| 11 | M | Whole upload read into memory before size check | Read at most limit + 1 bytes |
| 12 | M | Sync inference inside `async def` blocks the event loop | Plain `def` endpoints (threadpool) |
| 13 | M | Model loads lazily on first request | Load at startup (non-fatal, logged); `/api/health` reports `model_loaded`, 503 if it cannot load |
| 14 | H | Compare errors say 'treated' but the UI says "Recording B" | Messages say "Recording A (control)" / "Recording B (treated)" |
| 15 | L | Practical limit ~6,300 frames (3.5 min) compact JSON | Server frame cap (20k) as backstop; UI hint states the limit |

### C. Frontend

| # | Sev | Problem | Fix |
|---|---|---|---|
| 16 | H | No client-side file checks | `accept`, empty / over-size / video / CSV pre-checks with friendly messages |
| 17 | H | Two files each < 4 MiB can exceed the platform's 4.5 MB body cap | Combined-size check in Compare; readable messages for 413/5xx/504 |
| 18 | M | FastAPI list-valued `detail` shows "[object Object]" | Join messages |
| 19 | H | Compare of very different lengths shows no durations | Show both durations; non-blocking caution if either < 10 s or ratio > 3x. No truncation |
| 20 | L | Same file as A and B unnoticed | Hint when name/size/lastModified match |
| 21 | M | No error boundary; Pharmacology JSON parsed at import | Per-tab error boundary; lazy parse |
| 22 | L | Thousands of segments could render slowly | Check with the real model; not changed |
| 23 | L | Re-picking same filename does not fire `onChange` | Reset `input.value` after pick |

### D. Pharmacology generator (offline)

| # | Sev | Problem | Fix |
|---|---|---|---|
| 24 | L | Bad CSVs raise bare IndexError/KeyError/ValueError/LinAlgError | Wrapped errors naming file and reason |
| 25 | M | All-low-likelihood or 1-frame input yields NaN metrics and invalid JSON (`NaN`) | Minimum frames and valid fraction; write with `allow_nan=False` |

## Out of scope / known limitations

* Resident/intruder order cannot be validated from keypoints alone.
* Gaps longer than 5 frames are rejected rather than interpolated, to avoid fabricating motion.

## Implementation status

All items above are implemented except where noted:

* **#22** not changed (needs a real-model check on a long clip; see below).
* **#23** (re-picking the same filename) deliberately **not** done: clearing the input value on click would leave the UI
  holding a file the input no longer shows if the user cancels the dialog. Low severity, riskier than the problem.
* **#13** startup model load is non-fatal (logged) rather than fail-fast, so `/api/health` can report the problem.
* **#4** repair policy as decided: gaps up to 5 frames are interpolated (edges held), longer gaps rejected with location.
* **#8** scale detection is best effort: a modestly rescaled recording (body length still in 90 to 300 px) is not detectable.
* Where the changes live: `backend/validation.py` (new), `backend/main.py`, `frontend/src/{api,lib,components,views}`,
  `pharmacology/open_field.py`. Tests added in `backend/tests/{test_api,test_validation}.py`, several frontend test files
  and `pharmacology/tests/test_open_field.py`.

### To verify on real infrastructure (status: mostly done, see "Production verification")

* GitHub Actions backend job (pinned Python 3.11, scikit-learn 1.7.1, the real `model.joblib`): the new API tests assert
  contract behavior only; nothing asserts specific behavior labels.
* Upload a ~6,000-frame clip with the real model and check the Detail view renders quickly (#22).
* The `pharmacology/tests` suite is not part of CI today.

## Production verification (2026-11-19)

PR #10 was merged (merge commit `5fcfa3f`), all CI jobs passed on the pinned environment (backend with the real
`model.joblib`, ml, frontend, pharmacology), and the production Vercel deployment at
https://rodent-behavior-ml.vercel.app was checked by uploading test files straight to `/api`.
Files used live in the gitignored `data/processed/demo/` and `data/processed/demo/edge-cases/`.

| Check | Result |
|---|---|
| `GET /api/health` | 200 `{"status":"ok","model_loaded":true}` (field exists only in the new code) |
| Frontend root | 200, title "Rodent Behavior Analysis" |
| Valid 100 s clip, predict | 200 in 1.1 s |
| 2 s clip | 422 "only 2.0 s ... at least 3 s is needed" |
| 5 s clip | 200 with "Short recording (5.0 s)" warning |
| 30 s clip, 3-frame gap | 200 with "filled by interpolation" warning |
| 30 s clip, 30-frame gap | 422 naming `ear_left`, frames 100-129 |
| CSV text in a `.json` file | 415 "looks like CSV" |
| Fake video | 415 "not valid JSON" |
| 6,000-frame clip (3.78 MB), predict | 200 in 2.5 s including upload |
| Compare 5 s vs 100 s | 200, Recording A short-clip warning |
| Compare two 100 s demo clips | 200, `durations` present, no warnings |

Not verified in production:

* **UI behavior in a browser:** the checks above exercised the API only. Client-side file checks, the combined-size block
  in Compare, duration/caution notices and the Detail view rendering of a long result (#22, rendering part) still need a
  manual look. The API half of #22 is fine (2.5 s for 6,000 frames).
* The platform's 4.5 MB request cap (non-JSON 413) was not triggered.
