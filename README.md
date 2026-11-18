# Rodent Behavior ML Diagnosis

A neural network that classifies rodent behavior from video (grooming, rearing, investigation, etc.) and compares behavior frequencies between a control animal and a treated animal, the kind of observation currently done by hand in early-stage drug trials.

Built by a 3-person team, due Nov 28, 2026.

## Read first
- [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) — locked scope, roles, timeline. Read before writing any code.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — stack, folder layout, API contract. The contract is binding, propose changes instead of silently deviating.

## Layout
- [`/ml`](./ml) — dataset pipeline and model (pose-keypoint sequence classifier)
- [`/backend`](./backend) — FastAPI service serving predictions and comparisons
- [`/frontend`](./frontend) — React (Vite) app
- Deployed on Vercel, auto-deploys from `main`

## Data
Built on [CalMS21](https://sites.google.com/view/computational-behavior/our-datasets/calms21-dataset) and [MABe22](https://data.caltech.edu/records/rdsa8-rde65). Both are CC BY-NC-SA (non-commercial, attribution, share-alike). The raw datasets are not committed to this repo, see each dataset's own page for access.

## License
Code in this repo is MIT licensed (see `LICENSE`). This does not apply to the third-party datasets referenced above, which remain under their own CC BY-NC-SA terms.
