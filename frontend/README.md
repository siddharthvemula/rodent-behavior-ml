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

## Guided demo

A presenter-driven walkthrough layered over the real app, for talks and the demo video. Press **Guided demo** in the header, or open the app at `/#demo=N` to start on step N (1 to 8). It needs no uploads and no backend: it shows the model's **precomputed real output** on two held-out CalMS21 test clips, called **Clip A** and **Clip B** (`src/data/demo_clips.json`, made by `ml/export_demo_clips.py`).

| Key | Action |
| --- | --- |
| `→` / `PageDown` | next step |
| `←` / `PageUp` | previous step |
| `Home` / `End` | first / last step |
| `H` | hide or show the notes card |
| `Esc` | leave the demo |

Clicking a tab or the Summary/Detail toggle also leaves the demo, so the presenter can always take over. The eight steps are defined in `src/lib/demoFlow.ts` (which tab, view and element to highlight) and `src/lib/demoScript.ts` (the wording). **Every number on the card is built from the data files, and every step must carry a caveat saying what it does not show**; tests enforce both. The annotations on the "Checked against human annotators" step are CalMS21's own labels (CC BY 4.0) and are always shown with their attribution.

The demo's data and wording load only when the guide opens (`src/lib/useDemoBundle.ts`), so a malformed data file cannot stop the app from starting; a test fails if the main bundle imports them statically. To add a step: add it to `DEMO_FLOW`, give it text in `buildDemoScript`, and mark its target element with `data-demo="..."`.
