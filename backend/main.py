"""
Rodent Behavior ML API (backend skeleton).

Implements the contract in ARCHITECTURE.md:
- POST /predict  -> kicks off a behavior-classification job for one video/keypoint file.
- POST /compare  -> kicks off a job comparing a control video against a treated video.
- GET  /jobs/{job_id} -> poll for status/result.

This is intentionally a skeleton: model inference is mocked so the frontend and
the real /ml model can both build against this contract in parallel. Swap
`run_predict_job` and `run_compare_job` for real calls into /ml once the model
is ready. Do not change the response shape without updating ARCHITECTURE.md
and flagging it to the team first.
"""
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

app = FastAPI(title="Rodent Behavior ML API")

# In-memory job store. Fine for local dev and the Nov 28 demo; replace with a
# real queue/db (e.g. Redis, a Postgres table) before this needs to survive
# a server restart or run on more than one instance.
jobs: Dict[str, dict] = {}


class BehaviorSegment(BaseModel):
    start_time: float
    end_time: float
    behavior_label: str
    confidence: float


class CompareResult(BaseModel):
    control: Dict[str, float]
    treated: Dict[str, float]
    difference: Dict[str, float]


class JobStatus(BaseModel):
    job_id: str
    status: Literal["queued", "running", "done", "failed"]
    result: Optional[List[BehaviorSegment] | CompareResult] = None


def _new_job() -> str:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "queued",
        "result": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return job_id


def _mock_predict_result() -> List[dict]:
    # Placeholder until /ml ships a real model. Shape matches ARCHITECTURE.md.
    return [
        {"start_time": 0.0, "end_time": 4.2, "behavior_label": "grooming", "confidence": 0.91},
        {"start_time": 4.2, "end_time": 9.8, "behavior_label": "investigation", "confidence": 0.77},
        {"start_time": 9.8, "end_time": 15.0, "behavior_label": "rearing", "confidence": 0.84},
    ]


def _mock_compare_result() -> dict:
    return {
        "control": {"grooming": 0.40, "investigation": 0.35, "rearing": 0.25},
        "treated": {"grooming": 0.12, "investigation": 0.48, "rearing": 0.40},
        "difference": {"grooming": -0.28, "investigation": 0.13, "rearing": 0.15},
    }


@app.post("/predict", response_model=JobStatus)
async def predict(file: UploadFile = File(...)):
    job_id = _new_job()
    # Real version: enqueue a background task / worker that runs the /ml
    # model on `file` and writes the result into jobs[job_id] when done.
    jobs[job_id]["status"] = "done"
    jobs[job_id]["result"] = _mock_predict_result()
    return JobStatus(job_id=job_id, status=jobs[job_id]["status"], result=jobs[job_id]["result"])


@app.post("/compare", response_model=JobStatus)
async def compare(control: UploadFile = File(...), treated: UploadFile = File(...)):
    job_id = _new_job()
    jobs[job_id]["status"] = "done"
    jobs[job_id]["result"] = _mock_compare_result()
    return JobStatus(job_id=job_id, status=jobs[job_id]["status"], result=jobs[job_id]["result"])


@app.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return JobStatus(job_id=job_id, status=job["status"], result=job["result"])


@app.get("/health")
async def health():
    return {"status": "ok"}
