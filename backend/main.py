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
made-up results (all checks live in validation.py, see HARDENING_PLAN.md):
  * JSON that is clearly an attempt at keypoints (has a "frames" key) but
    is unusable (bad schema, too short, long tracking gaps, ...) gets a 422
    with the reason and location.
  * Anything else (a raw video, CSV or raw CalMS21 file, which we can't
    classify) gets a 415.
Short tracking gaps are repaired and reported in the job's `warnings`.
"""
import logging
import sys
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))
from ml_model.inference import _get_model, compare_behaviors, predict_behaviors
from validation import Recording, UploadRejected, oversized_hint, validate_recording

logger = logging.getLogger("rodent-api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Load the model up front so a broken install shows in the logs and on
    # /api/health at startup, not on the first demo click. Non-fatal: the
    # request path still retries lazily.
    try:
        _get_model()
    except Exception:
        logger.exception("model failed to load at startup")
    yield


app = FastAPI(title="Rodent Behavior ML API", lifespan=lifespan)
api = APIRouter(prefix="/api")

# In-memory job store. Fine for local dev and the Nov 28 demo; replace with a
# real queue/db (e.g. Redis, a Postgres table) before this needs to survive
# a server restart or run on more than one instance.
jobs: "OrderedDict[str, dict]" = OrderedDict()
MAX_JOBS = 100  # oldest finished jobs are evicted so memory stays bounded

# Vercel Functions hard-cap every request body at 4.5MB with no way to raise
# it (confirmed against Vercel's own docs, Nov 17). We stay under that with
# headroom for multipart overhead. A real video upload can easily exceed
# this; pre-extracted keypoint files should not. Interim limit while this
# deploys as a Vercel Function: a real fix (direct-to-Blob client uploads,
# bypassing this function entirely) is a stretch goal, not required for
# Nov 28, see ARCHITECTURE.md.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024  # 4 MiB


def _read_and_validate(file: UploadFile, label: str) -> bytes:
    # Read at most limit+1 bytes: enough to detect "too big" without holding a huge upload in memory.
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) == 0:
        raise HTTPException(status_code=400, detail=f"'{label}' is empty")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                f"'{label}' is over the {MAX_UPLOAD_BYTES // (1024 * 1024)} MiB limit for this deployment. "
                "Trim the clip or use a pre-extracted keypoints file instead (about 3.5 minutes of "
                f"compact keypoints JSON fits).{oversized_hint(content)}"
            ),
        )
    return content


def _validate(file: UploadFile, label: str) -> Recording:
    content = _read_and_validate(file, label)
    try:
        return validate_recording(content, label)
    except UploadRejected as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc


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
    # Additive fields (HARDENING_PLAN.md): older clients simply ignore them.
    warnings: List[str] = []
    durations: Optional[Dict[str, float]] = None  # compare only: {"control": s, "treated": s}


def _new_job() -> str:
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "status": "queued",
        "result": None,
        "warnings": [],
        "durations": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    while len(jobs) > MAX_JOBS:
        jobs.popitem(last=False)
    return job_id


def _status(job_id: str) -> JobStatus:
    job = jobs[job_id]
    return JobStatus(
        job_id=job_id,
        status=job["status"],
        result=job["result"],
        warnings=job["warnings"],
        durations=job["durations"],
    )


def _run_job(job_id: str, fn, *args):
    """Run inference; on any failure mark the job failed and answer with a
    clean JSON 500 instead of leaving a job stuck in 'queued'."""
    jobs[job_id]["status"] = "running"
    try:
        jobs[job_id]["result"] = fn(*args)
    except Exception:
        logger.exception("inference failed for job %s", job_id)
        jobs[job_id]["status"] = "failed"
        raise HTTPException(
            status_code=500,
            detail="The classifier failed on this recording. Check that it is a valid CalMS21-style keypoints file.",
        ) from None
    jobs[job_id]["status"] = "done"


# Plain `def` (not async): inference is CPU-bound and synchronous, so FastAPI
# runs these in its threadpool instead of blocking the event loop.
@api.post("/predict", response_model=JobStatus)
def predict(file: UploadFile = File(...)):
    rec = _validate(file, "file")
    job_id = _new_job()
    jobs[job_id]["warnings"] = rec.warnings
    _run_job(job_id, predict_behaviors, rec.keypoints, rec.frame_rate)
    return _status(job_id)


@api.post("/compare", response_model=JobStatus)
def compare(control: UploadFile = File(...), treated: UploadFile = File(...)):
    a = _validate(control, "Recording A (control)")
    b = _validate(treated, "Recording B (treated)")
    job_id = _new_job()
    jobs[job_id]["warnings"] = [f"Recording A: {w}" for w in a.warnings] + [f"Recording B: {w}" for w in b.warnings]
    jobs[job_id]["durations"] = {"control": round(a.duration, 2), "treated": round(b.duration, 2)}
    _run_job(job_id, compare_behaviors, a.keypoints, b.keypoints, a.frame_rate, b.frame_rate)
    return _status(job_id)


@api.get("/jobs/{job_id}", response_model=JobStatus)
def get_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="job not found")
    return _status(job_id)


@api.get("/health")
def health():
    try:
        _get_model()
    except Exception as exc:
        logger.exception("health check: model not loadable")
        return JSONResponse(status_code=503, content={"status": "error", "model_loaded": False, "detail": str(exc)})
    return {"status": "ok", "model_loaded": True}


app.include_router(api)
