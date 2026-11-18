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

Model inference: an upload that parses as the keypoints JSON contract (see
ml/preprocess.py and ARCHITECTURE.md "Data schema") is classified by the
CalMS21-trained scikit-learn model in backend/ml_model/ (a byte-for-byte copy
of the matching files in ml/, enforced by tests/test_ml_sync.py; see that
package's docstring for why it's duplicated). Labels are attack /
investigation / mount / other.

Uploads that aren't valid keypoints JSON are rejected, never answered with
made-up results:
  * JSON that is clearly an attempt at keypoints (has a "frames" key) but
    doesn't match the contract gets a 422 with the reason.
  * Anything else (e.g. a raw video, which we can't classify because no
    pose-extraction step exists yet) gets a 415.
"""
import json
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


def _looks_like_keypoints_attempt(content: bytes) -> bool:
    """True if the upload is JSON that was clearly meant to be a keypoints
    file (an object with a "frames" key), as opposed to e.g. a video."""
    try:
        data = json.loads(content)
    except (ValueError, UnicodeDecodeError):
        return False
    return isinstance(data, dict) and "frames" in data


def _parse_keypoints(content: bytes, field_name: str):
    """Returns (keypoints, frame_rate) or raises: 422 for keypoints JSON that
    doesn't match the schema (with the reason), 415 for anything that isn't
    keypoints JSON at all (e.g. a raw video, which we can't classify yet)."""
    try:
        return parse_keypoints_json(content)
    except KeypointsFormatError as exc:
        if _looks_like_keypoints_attempt(content):
            raise HTTPException(
                status_code=422,
                detail=f"'{field_name}' is not a valid keypoints file: {exc}. See ARCHITECTURE.md 'Data schema'.",
            ) from exc
        raise HTTPException(
            status_code=415,
            detail=(
                f"'{field_name}' is not a keypoints JSON file ({exc}). Only pre-extracted pose "
                "keypoints are supported; raw video can't be classified yet. See ARCHITECTURE.md 'Data schema'."
            ),
        ) from exc


@api.post("/predict", response_model=JobStatus)
async def predict(file: UploadFile = File(...)):
    content = await _read_and_validate(file, "file")
    keypoints, frame_rate = _parse_keypoints(content, "file")
    job_id = _new_job()
    result = predict_behaviors(keypoints, frame_rate)
    jobs[job_id]["status"] = "done"
    jobs[job_id]["result"] = result
    return JobStatus(job_id=job_id, status=jobs[job_id]["status"], result=jobs[job_id]["result"])


@api.post("/compare", response_model=JobStatus)
async def compare(control: UploadFile = File(...), treated: UploadFile = File(...)):
    control_content = await _read_and_validate(control, "control")
    treated_content = await _read_and_validate(treated, "treated")
    control_kp, control_rate = _parse_keypoints(control_content, "control")
    treated_kp, treated_rate = _parse_keypoints(treated_content, "treated")
    job_id = _new_job()
    result = compare_behaviors(control_kp, treated_kp, control_rate, treated_rate)
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
