# Rodent Behavior Analysis

A classifier that labels mouse social behavior (attack, investigation, mount, other) from pose keypoints of two interacting mice, and compares behavior frequencies between two recordings. Automated behavior scoring like this replaces a task that is currently done by hand in studies of rodent behavior.

> **Scope note:** this project demonstrates automated behavior classification and comparison. It does not diagnose anything or show that a drug or treatment worked. The compare demo uses two real CalMS21 recordings as a stand-in for control and treatment groups, because we have no real drug-trial data. Differences it reports are between those two clips only and are not a statistical test or evidence of a treatment effect. The separate Pharmacology demo tab uses real dose-group data (see below) but is also descriptive only.

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

### Pharmacology demo dataset (separate from CalMS21)
The "Pharmacology demo" tab uses real yohimbine dose groups (saline, 1, 3 and 6 mg/kg; 8 mice each) from:

> von Ziegler, L. M., Roessler, F. K., Sturman, O., O'Connor, E. C., & Bohacek, J. (2023). *Raw video and pose estimation data of top view open field mouse behavior recordings after yohimbine injections* [Data set]. Zenodo. https://doi.org/10.5281/zenodo.8188683

Licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). We use only the DeepLabCut pose CSVs and `METADATA_ROCHE.csv`, not the videos, and not the data's authors' analysis: the three open-field metrics (distance traveled, time in center, average speed) are our own computation in `pharmacology/open_field.py`. This dataset has no behavior labels, so the CalMS21 classifier is not run on it. Distances are in image pixels, since the data has no physical scale. Raw data is not committed; `python pharmacology/download_data.py` fetches it, and `python pharmacology/open_field.py` regenerates `frontend/src/data/open_field.json`. The page itself is still descriptive only (no significance claims shown yet). `python pharmacology/dose_response.py` writes `frontend/src/data/dose_response.json`: per-dose effect sizes vs saline (Hedges' g and raw difference, bootstrap 95% CIs), exact two-sided permutation p-values with Holm correction across a fixed family of 6 primary comparisons (distance and center time, 3 doses each), a dose-trend test, and a simulated power note (with 8 vs 8 mice only effects of about d = 1.6 are detectable at 80% power, about d = 2.2 after correcting for the family). These statistics describe these 32 mice only; they are not evidence about yohimbine in general. In this data distance falls steeply with dose (3 and 6 mg/kg clearly different from saline), while time in center is a non-monotonic bump (1 mg/kg differs from saline, 6 mg/kg does not) and is likely confounded with locomotion.

**Frame rate is not stated in the dataset** (the Zenodo record and metadata give none, and the videos are not included here). The authors' own analysis code for these 32 files uses 30 fps (`KmeansClustering_YohimbineRoche_25Clusters.Rmd`, which also trims frames 300 to 36000, i.e. 10 s to 20 min at 30 fps), and the recordings are about 53.9k frames, i.e. 29.97 min at 30 fps. One of their supplementary-figure scripts divides frames by 25, so this is inferred, not verified. Anything shown in minutes must say so; distance and center-time results here do not depend on it.

## License
Code in this repo is MIT licensed (see `LICENSE`). This does not apply to the third-party dataset referenced above, which remains under its own license (CC BY 4.0, attribution required).
