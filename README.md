# Rodent Behavior Analysis

A classifier that labels mouse social behavior (attack, investigation, mount, other) from pose keypoints of two interacting mice, and compares behavior frequencies between two recordings. Automated behavior scoring like this replaces a task that is currently done by hand in studies of rodent behavior.

> **Scope note:** this project demonstrates automated behavior classification and comparison. It does not diagnose anything or show that a drug or treatment worked. The compare demo uses two real CalMS21 recordings as a stand-in for control and treatment groups, because we have no real drug-trial data. Differences it reports are between those two clips only and are not a statistical test or evidence of a treatment effect.

Built by a 3-person team, due Nov 28, 2026.

## Read first
- [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) — locked scope, roles, timeline. Read before writing any code.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — stack, folder layout, API contract. The contract is binding, propose changes instead of silently deviating.

## Layout
- [`/ml`](./ml) — dataset pipeline and model (pose-keypoint classifier, scikit-learn; test macro-F1 0.886 on CalMS21 Task 1, see `ml/README.md`)
- [`/backend`](./backend) — FastAPI service serving predictions and comparisons
- [`/frontend`](./frontend) — React (Vite) app
- Deployed on Vercel, auto-deploys from `main`

## Data
Built on [CalMS21](https://data.caltech.edu/records/s0vdx-0k302) Task 1 (Sun et al., 2021, "The Multi-Agent Behavior Dataset: Mouse Dyadic Social Interactions"), listed as CC BY 4.0 on CaltechDATA; we stay non-commercial and cite it regardless. The raw data is not committed to this repo, `python ml/download_data.py` fetches it.

## License
Code in this repo is MIT licensed (see `LICENSE`). This does not apply to the third-party dataset referenced above, which remains under its own license (CC BY 4.0, attribution required).
