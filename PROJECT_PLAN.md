# Rodent Behavior ML Diagnosis — Project Plan

Deadline: Nov 28, 2026. 4-person team.

## Locked decisions (do not redebate these)
- Context: hackathon submission and/or scored competition. Demo polish and a clearly reported metric matter.
- Scope: mice, social/dyadic behavior. Built on CalMS21 and MABe22 (CC BY-NC-SA, non-commercial, cite the papers, never commit the raw dataset to this repo).
- Core task (must ship): classify known behaviors (supervised), then build the control-vs-treated comparison by running the classifier on each video separately and diffing behavior frequencies.
- Stretch goal (only after the core works end to end): shift/anomaly detection against a learned baseline.
- Product: both a per-video behavior timeline and a control-vs-treated comparison view.

## Team roles
- Data/ML: [name]
- Backend (FastAPI + model serving): [name]
- Frontend (React): [name]
- Deployment/DevOps + integration + PM: Sid

## Timeline
| Days | Focus |
| --- | --- |
| Nov 17-18 | Repo, plan docs, roles, dataset picked |
| Nov 19-20 | Data pipeline + fixed API contract |
| Nov 21-23 | Model training, backend skeleton, frontend shell, Vercel staging live |
| Nov 24-25 | Integrate model into backend, connect real frontend |
| Nov 26 | Bug bash, comparison view |
| Nov 27 | Feature freeze, polish, writeup, demo video |
| Nov 28 | Final deploy, submit |

## Rules for every Claude Code session
1. Read this file and ARCHITECTURE.md before writing code.
2. Work only in your assigned area.
3. Branch per feature, open a PR, never push to main directly.
4. Flag problems with the plan instead of silently working around them.
