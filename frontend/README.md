# Frontend

React (Vite + TypeScript) UI for the two required views in `../PROJECT_PLAN.md`:

1. **Timeline**: upload one video or keypoint file and see the predicted behavior timeline.
2. **Control vs treated**: upload a control and a treated file and see per-behavior frequencies side by side, with the difference.

API calls follow the contract in `../ARCHITECTURE.md` and the backend in `../backend/main.py`:

| Call | Request | Response |
| --- | --- | --- |
| `POST /predict` | multipart `file` | `JobStatus` with `result: BehaviorSegment[]` |
| `POST /compare` | multipart `control`, `treated` | `JobStatus` with `result: {control, treated, difference}` |
| `GET /jobs/{id}` | none | `JobStatus` |

If a POST returns `queued` or `running`, the client polls `/jobs/{id}` (1s interval, 2 min cap) until the job is `done` or `failed`. Every response is validated against the contract before it is rendered.

## Run

```bash
npm install
npm run dev          # mock data (no backend needed)
```

Against the local backend (`cd ../backend && uvicorn main:app`):

```bash
VITE_API_BASE_URL=/api npm run dev
```

`/api` is proxied by the Vite dev server to `http://localhost:8000` (override with `BACKEND_DEV_URL`). This keeps the browser same-origin, because the backend does not enable CORS.

| Variable | Effect |
| --- | --- |
| `VITE_API_BASE_URL` | Backend base URL. Empty means mock mode. |
| `VITE_USE_MOCK=true` | Force mock mode even when a base URL is set. |

The mock responses live in `src/mocks/*.json` and use the same `JobStatus` shape the backend returns.

## Scripts

```bash
npm test             # vitest
npm run coverage     # vitest with coverage
npm run lint
npm run build        # typecheck + production build
```

## Layout

```
src/api/         contract types, response validation, API client (+ polling, mock mode)
src/mocks/       mocked JSON in the backend's JobStatus schema
src/lib/         pure helpers (timeline summary, compare rows, colors) and useAsyncTask
src/components/  FilePicker, StatusMessage, BehaviorTimeline, ComparisonChart
src/views/       TimelineView, CompareView
```
