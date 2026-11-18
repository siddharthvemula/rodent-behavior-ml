"""
Rodent Behavior ML API (backend skeleton).

Implements the contract in ARCHITECTURE.md:
- POST /api/predict  -> kicks off a behavior-classification job for one video/keypoint file.
- POST /api/compare  -> kicks off a job comparing a control video against a treated video.
- GET  /api/jobs/{job_id} -> poll for status/result.

Routes live under /api because this deploys as a Vercel Services project:
the frontend and backend share one public domain, and a top-level rewrite
sends everything under /api to this service, everything else to the
frontend. See /vercel.json at the repo root. The frontend's
VITE_API_BASE_URL is set to "/api" in production so no CORS setup is needed,
same origin. (Flagging this prefix as a deliberate change to the original
ARCHITECTURE.md contract, which didn't have it, see ARCHITECTURE.md for the
updated version.)

Model inference: if the uploaded file parses as the keypoints JSON contract
(see ml/preprocess.py), this calls a real model (backend/ml_model/, a copy
of ml/, see that package's docstring for why it's duplicated). That model
is currently trained on SYNTHETIC data, not CalMS21/MABe22, it's a
placeholder standing in for krishtotala105's real pipeline (issue #1), done
Nov 17-18 to keep the team moving, not a replacement for that work. If the
upload doesn't parse as keypoints (e.g. it's a raw video, no pose-extraction
step exists yet), this falls back to the original hardcoded mock rather
than pretending to classify something it can't. See ARCHITECTURE.md.
"""
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))
from ml_model.inference import compare_behaviors, predict_behaviors
from ml_model.preprocess import KeypointsFormatError, parse_keypoints_json

app = FastAPI(title="Rodent Behavior ML API")
api = APIRouter(prefix="/api")

# In-memory job store. Fine for local dev and the Nov 28 demo; replace with a
# real queue/db (e.g. Redis, a Postgres table) before this needs to survive
# a server restart or run on more than one instance.
jobs: Dict[str, dict] = {}

# Vercel Functions hard-cap every request body at 4.5MB with no way to raise
# it (confirmed against Vercel's own docs, Nov 17). We stay under that with
# headroom for multipart overhead. A real video upload can easily exceed
# this; pre-extracted keypoint files should not. Interim limit while this
# deploys as a Vercel Function: a real fix (direct-to-Blob client uploads,
# bypassing this function entirely) is a stretch goal, not required for
# Nov 28, see ARCHITECTURE.md.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024  # 4 MiB


async def _read_and_validate(file: UploadFile, field_name: str) -> bytes:
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail=f"'{field_name}' is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"'{field_name}' is {len(content)} bytes, over the "
                f"{MAX_UPLOAD_BYTES} byte limit for this deployment. "
                "Trim the clip or use a pre-extracted keypoints file instead."
            ),
        )
    return content


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


@api.post("/predict", response_model=JobStatus)
async def predict(file: UploadFile = File(...)):
    content = await _read_and_validate(file, "file")
    job_id = _new_job()
    # Real inference if this parses as keypoints; otherwise fall back to the
    # mock rather than guess at a video file we have no pose-extraction for.
    try:
        frames, frame_rate = parse_keypoints_json(content)
        result = predict_behaviors(frames, frame_rate)
    except KeypointsFormatError:
        result = _mock_predict_result()
    jobs[job_id]["status"] = "done"
    jobs[job_id]["result"] = result
    return JobStatus(job_id=job_id, status=jobs[job_id]["status"], result=jobs[job_id]["result"])


@api.post("/compare", response_model=JobStatus)
async def compare(control: UploadFile = File(...), treated: UploadFile = File(...)):
    control_content = await _read_and_validate(control, "control")
    treated_content = await _read_and_validate(treated, "treated")
    job_id = _new_job()
    try:
        control_frames, control_rate = parse_keypoints_json(control_content)
        treated_frames, treated_rate = parse_keypoints_json(treated_content)
        result = compare_behaviors(control_frames, treated_frames, control_rate, treated_rate)
    except KeypointsFormatError:
        result = _mock_compare_result()
    jobs[job_id]["status"] = "done"
    jobs[job_id]["result"] = result
    return JobStatus(job_id=job_id, status=jobs[job_id]["status"], result=jobs[job_id]["result"])


@api.get("/jobs/{job_id}", response_model=JobStatus)
async def get_job(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return JobStatus(job_id=job_id, status=job["status"], result=job["result"])


@api.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(api)
