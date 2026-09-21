"""Retina Rescue ML backend (FastAPI).

Stage 1  image quality check            (OpenCV)
Stage 2  lesion candidate segmentation  (OpenCV, heuristic)
Stage 3  bilateral DR grading           (MATLAB Engine + trained network)
Stage 4  Grad-CAM explainability        (MATLAB Engine)

Every /api route except /api/health requires a valid session token issued by
the auth-server. Tokens are verified by asking the auth-server (/api/auth/me),
so the JWT secret never leaves that service and logouts are honoured.
"""
import asyncio
import base64
import hashlib
import logging
import os
import tempfile
import threading
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

import cv2
import httpx
import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
load_dotenv(BASE_DIR / ".env")

log = logging.getLogger("retina-rescue")
logging.basicConfig(level=logging.INFO)

CLIENT_ORIGINS = [o.strip() for o in os.getenv("CLIENT_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
AUTH_SERVER_URL = os.getenv("AUTH_SERVER_URL", "http://localhost:4000").rstrip("/")
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "15")) * 1024 * 1024
MATLAB_ENABLED = os.getenv("DISABLE_MATLAB", "").lower() not in ("1", "true", "yes")

TRANSLATION_TARGETS = ("hi", "kn")
TRANSLATION_CACHE_SIZE = 1000

# MATLAB folders (relative to the repo root) that the Stage 3/4 functions need.
MATLAB_PATHS = [
    "utils",
    "stage1_quality",
    "stage_3",
    "stage4_explainability/core",
    "stage4_explainability/report",
]


# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #
# Seconds a verified token is trusted without re-asking the auth-server. This is also the longest a
# logged-out token keeps working here, so it is kept short: it only needs to absorb bursts of requests.
_AUTH_CACHE_TTL = 5.0
_auth_cache: dict[str, float] = {}


async def require_user(authorization: str | None = Header(default=None)) -> None:
    """Reject the request unless the auth-server accepts its bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not signed in.")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in.")

    key = hashlib.sha256(token.encode()).hexdigest()
    now = time.monotonic()
    if _auth_cache.get(key, 0.0) > now:
        return

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{AUTH_SERVER_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError:
        log.warning("Auth server unreachable at %s", AUTH_SERVER_URL)
        raise HTTPException(status_code=503, detail="Authentication service is unavailable.")

    if resp.status_code != 200:
        _auth_cache.pop(key, None)
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")

    if len(_auth_cache) > 1000:
        for k in [k for k, exp in _auth_cache.items() if exp <= now]:
            del _auth_cache[k]
    _auth_cache[key] = now + _AUTH_CACHE_TTL


# --------------------------------------------------------------------------- #
# MATLAB engine (lazy, single-threaded access)
# --------------------------------------------------------------------------- #
class MatlabService:
    """Owns the MATLAB engine. The engine is not thread-safe, so every call is serialised."""

    def __init__(self) -> None:
        self._engine = None
        self._error: str | None = None
        self._lock = threading.Lock()
        self._started = False

    @property
    def status(self) -> str:
        if not MATLAB_ENABLED:
            return "disabled"
        if self._engine is not None:
            return "ready"
        return "unavailable" if self._error else "starting"

    def _start_locked(self) -> None:
        if self._started:
            return
        self._started = True
        if not MATLAB_ENABLED:
            self._error = "MATLAB is disabled (DISABLE_MATLAB is set)."
            return
        try:
            import matlab.engine  # imported lazily: only needed for Stage 3/4

            log.info("Starting MATLAB Engine (this can take a while)...")
            eng = matlab.engine.start_matlab()
            for rel in MATLAB_PATHS:
                eng.addpath(str(REPO_ROOT / rel), nargout=0)
            self._engine = eng
            log.info("MATLAB Engine ready. Loading the Stage 3 model...")
            try:
                eng.loadStage3Model(nargout=0)  # cached in MATLAB, so the first request isn't slow
            except Exception:  # noqa: BLE001 - a missing model surfaces on the first real request
                log.exception("Could not pre-load the Stage 3 model")
        except Exception as exc:  # noqa: BLE001 - surface any startup failure to callers
            log.exception("MATLAB Engine failed to start")
            self._error = str(exc)

    def start(self) -> None:
        with self._lock:
            self._start_locked()

    def call(self, name: str, *args, nargout: int = 1):
        with self._lock:
            self._start_locked()
            if self._engine is None:
                raise HTTPException(status_code=503, detail=f"MATLAB Engine is unavailable: {self._error}")
            return getattr(self._engine, name)(*args, nargout=nargout)


matlab_service = MatlabService()


# --------------------------------------------------------------------------- #
# Offline translation
# --------------------------------------------------------------------------- #
class TranslationRequest(BaseModel):
    text: str = Field(max_length=2000)
    targetLang: Literal["en", "hi", "kn"] = "en"


_translation_cache: "OrderedDict[str, str]" = OrderedDict()


def init_translation_models() -> None:
    """Install any missing English->hi/kn Argos packages (no-op when already installed)."""
    try:
        import argostranslate.package

        installed = {(p.from_code, p.to_code) for p in argostranslate.package.get_installed_packages()}
        missing = [lang for lang in TRANSLATION_TARGETS if ("en", lang) not in installed]
        if not missing:
            return
        argostranslate.package.update_package_index()
        available = argostranslate.package.get_available_packages()
        for lang in missing:
            pkg = next((p for p in available if p.from_code == "en" and p.to_code == lang), None)
            if pkg:
                log.info("Downloading translation model: en -> %s", lang)
                argostranslate.package.install_from_path(pkg.download())
    except Exception:  # noqa: BLE001 - translation is optional
        log.exception("Could not prepare translation packages")


def _translate(text: str, lang: str) -> str:
    import argostranslate.translate

    return argostranslate.translate.translate(text, "en", lang)


# --------------------------------------------------------------------------- #
# App
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm up slow resources in the background so the server accepts requests immediately.
    tasks = [asyncio.create_task(run_in_threadpool(init_translation_models))]
    if MATLAB_ENABLED:
        tasks.append(asyncio.create_task(run_in_threadpool(matlab_service.start)))
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(title="Retina Rescue Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CLIENT_ORIGINS,
    allow_credentials=False,  # auth uses a bearer header, not cookies
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)


# --------------------------------------------------------------------------- #
# Upload helpers
# --------------------------------------------------------------------------- #
async def read_image(file: UploadFile, flags: int = cv2.IMREAD_COLOR) -> np.ndarray:
    """Read an upload fully into memory (size-capped) and decode it. Nothing touches disk."""
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Image is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), flags)
    if img is None:
        raise HTTPException(status_code=400, detail="The uploaded file is not a readable image.")
    return img


def png_data_url(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".png", img)
    if not ok:
        raise RuntimeError("PNG encoding failed")
    return "data:image/png;base64," + base64.b64encode(buf).decode("ascii")


# --------------------------------------------------------------------------- #
# Stage 1 - quality
# --------------------------------------------------------------------------- #
BLUR_THRESHOLD = 12.0
DARK_LIMIT, BRIGHT_LIMIT = 45.0, 210.0


def assess_quality(gray: np.ndarray) -> dict:
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(np.mean(gray))
    if sharpness < BLUR_THRESHOLD:
        return {
            "verdict": "reject",
            "status": "rejected",
            "reason": "Image rejected: too blurry for a reliable assessment. Please retake the photo.",
            "score": sharpness,
        }
    if brightness < DARK_LIMIT or brightness > BRIGHT_LIMIT:
        return {
            "verdict": "enhance",
            "status": "accepted",
            "reason": "Image is poorly illuminated; contrast enhancement will be applied.",
            "score": sharpness,
        }
    return {"verdict": "accept", "status": "accepted", "reason": "Quality check passed.", "score": sharpness}


@app.post("/api/stage1-quality", dependencies=[Depends(require_user)])
async def check_image_quality(file: UploadFile = File(...)):
    gray = await read_image(file, cv2.IMREAD_GRAYSCALE)
    return await run_in_threadpool(assess_quality, gray)


# --------------------------------------------------------------------------- #
# Stage 2 - lesion candidates (heuristic image processing, not the neural net)
# --------------------------------------------------------------------------- #
# RGBA colours (OpenCV writes BGRA, so these are listed as B, G, R, A).
EXUDATE_BGRA = (153, 211, 52, 200)
HEMORRHAGE_BGRA = (94, 63, 244, 200)
MICROANEURYSM_BGRA = (36, 191, 251, 255)


def _paint_components(binary, min_area, max_area, colour, mask_img) -> int:
    n, labels, stats, _ = cv2.connectedComponentsWithStats((binary * 255).astype(np.uint8))
    count = 0
    for i in range(1, n):
        if min_area <= stats[i, cv2.CC_STAT_AREA] <= max_area:
            mask_img[labels == i] = colour
            count += 1
    return count


def segment_lesions(img: np.ndarray) -> tuple[np.ndarray, dict]:
    height, width = img.shape[:2]
    scale = (height * width) / (512 * 512)

    # Circular field-of-view mask, eroded so border artefacts aren't flagged.
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, fov = cv2.threshold(gray, 15, 255, cv2.THRESH_BINARY)
    kernel_circle = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    fov = cv2.morphologyEx(fov, cv2.MORPH_CLOSE, kernel_circle)
    inner = cv2.erode(fov, kernel_circle, iterations=3)
    if not inner.any():
        raise HTTPException(status_code=422, detail="No retina was detected in this image.")

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(img[:, :, 1]).astype(np.float32) / 255.0
    inside = inner > 0

    def top_percentile(response, pct):
        response = cv2.bitwise_and(response, response, mask=inner)
        _, thresh = cv2.threshold(response, np.percentile(response[inside], pct), 1.0, cv2.THRESH_BINARY)
        return thresh

    mask_img = np.zeros((height, width, 4), dtype=np.uint8)

    bright = enhanced - cv2.GaussianBlur(enhanced, (0, 0), sigmaX=15)
    exudates = _paint_components(top_percentile(bright, 98), 15 * scale, 600 * scale, EXUDATE_BGRA, mask_img)

    dark = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=8) - enhanced
    hemorrhages = _paint_components(top_percentile(dark, 97), 30 * scale, 2000 * scale, HEMORRHAGE_BGRA, mask_img)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    tophat = cv2.morphologyEx(enhanced, cv2.MORPH_TOPHAT, kernel)
    microaneurysms = _paint_components(top_percentile(tophat, 99.4), 2 * scale, 80 * scale, MICROANEURYSM_BGRA, mask_img)

    counts = {"microaneurysms": microaneurysms, "hemorrhages": hemorrhages, "exudates": exudates}
    return mask_img, counts


@app.post("/api/stage2-segmentation", dependencies=[Depends(require_user)])
async def run_stage2_segmentation(file: UploadFile = File(...)):
    img = await read_image(file)
    try:
        mask_img, counts = await run_in_threadpool(segment_lesions, img)
    except HTTPException:
        raise
    except Exception:
        log.exception("Stage 2 segmentation failed")
        raise HTTPException(status_code=500, detail="Lesion segmentation failed.")
    return {"status": "success", "maskUrl": png_data_url(mask_img), "counts": counts}


# --------------------------------------------------------------------------- #
# Stage 3 - bilateral grading (MATLAB)
# --------------------------------------------------------------------------- #
STAGE_LABELS = {
    "No_DR": "Stage 0 - Clear",
    "Mild": "Stage 1 - Mild",
    "Moderate": "Stage 2 - Moderate",
    "Severe": "Stage 3 - Severe",
    "Proliferate_DR": "Stage 4 - Proliferative",
}
DISCLAIMER = " This is an automated screening aid, not a diagnosis."


def build_summary(overall: str, left: str, right: str) -> str:
    """Grade-based wording only: it never claims lesions the model was not asked about."""
    affected = [name for name, grade in (("left", left), ("right", right)) if grade == overall]
    eyes = " and ".join(affected) + (" eye" if len(affected) == 1 else " eyes")
    if overall == "No_DR":
        text = "No signs of diabetic retinopathy were flagged in either eye. Continue routine annual screening."
    elif overall == "Mild":
        text = (
            f"Mild non-proliferative diabetic retinopathy (Stage 1) was flagged in the {eyes}. "
            "Clinical review is advised; repeat screening in 6-12 months or as directed by a clinician."
        )
    elif overall == "Moderate":
        text = (
            f"Moderate non-proliferative diabetic retinopathy (Stage 2) was flagged in the {eyes}. "
            "This cannot be cleared automatically: specialist review is recommended."
        )
    elif overall in ("Severe", "Proliferate_DR"):
        stage = "Stage 3 - severe" if overall == "Severe" else "Stage 4 - proliferative"
        text = (
            f"URGENT: {stage} diabetic retinopathy was flagged in the {eyes}. "
            "Immediate ophthalmologist review is required."
        )
    else:
        text = f"Bilateral analysis complete. Highest flagged grade: {overall}. Clinical review is required."
    return text + DISCLAIMER


def grade_eyes(left_img: np.ndarray, right_img: np.ndarray) -> tuple[str, str, str, float, float]:
    # Re-encode as PNG so MATLAB always gets a clean file with a known extension.
    with tempfile.TemporaryDirectory(prefix="retina_") as tmp:
        left_path, right_path = Path(tmp) / "left.png", Path(tmp) / "right.png"
        cv2.imwrite(str(left_path), left_img)
        cv2.imwrite(str(right_path), right_img)
        overall, left, right, left_conf, right_conf = matlab_service.call(
            "assessBilateralFromFiles", str(left_path), str(right_path), nargout=5
        )
    return str(overall), str(left), str(right), float(left_conf), float(right_conf)


@app.post("/api/stage3-assessment", dependencies=[Depends(require_user)])
async def run_stage3_assessment(leftEye: UploadFile = File(...), rightEye: UploadFile = File(...)):
    left_img = await read_image(leftEye)
    right_img = await read_image(rightEye)
    try:
        overall, left, right, left_conf, right_conf = await run_in_threadpool(grade_eyes, left_img, right_img)
    except HTTPException:
        raise
    except Exception:
        log.exception("Stage 3 assessment failed")
        raise HTTPException(status_code=500, detail="Assessment failed.")

    return {
        "status": "success",
        "leftGrade": STAGE_LABELS.get(left, left),
        "rightGrade": STAGE_LABELS.get(right, right),
        "leftConfidence": left_conf,
        "rightConfidence": right_conf,
        "overallRisk": overall,
        "overallSummary": build_summary(overall, left, right),
    }


# --------------------------------------------------------------------------- #
# Stage 4 - real Grad-CAM (MATLAB)
# --------------------------------------------------------------------------- #
def render_gradcam(img: np.ndarray) -> np.ndarray:
    with tempfile.TemporaryDirectory(prefix="retina_") as tmp:
        src, dst = Path(tmp) / "in.png", Path(tmp) / "gradcam.png"
        cv2.imwrite(str(src), img)
        matlab_service.call("gradCamToFile", str(src), str(dst), nargout=0)
        out = cv2.imread(str(dst), cv2.IMREAD_COLOR)
    if out is None:
        raise RuntimeError("MATLAB did not produce a Grad-CAM image.")
    return out


@app.post("/api/stage4-heatmap", dependencies=[Depends(require_user)])
async def run_stage4_heatmap(file: UploadFile = File(...)):
    img = await read_image(file)
    try:
        overlay = await run_in_threadpool(render_gradcam, img)
    except HTTPException:
        raise
    except Exception:
        log.exception("Stage 4 Grad-CAM failed")
        raise HTTPException(status_code=500, detail="Grad-CAM generation failed.")
    return {"status": "success", "heatmapUrl": png_data_url(overlay), "method": "gradcam"}


# --------------------------------------------------------------------------- #
# Misc
# --------------------------------------------------------------------------- #
@app.post("/api/translate-dynamic", dependencies=[Depends(require_user)])
async def translate_dynamic(payload: TranslationRequest):
    text, lang = payload.text, payload.targetLang
    if lang == "en" or not text.strip():
        return {"translatedText": text}

    key = f"{lang}:{text}"
    if key in _translation_cache:
        _translation_cache.move_to_end(key)
        return {"translatedText": _translation_cache[key]}

    try:
        translated = await run_in_threadpool(_translate, text, lang)
    except Exception:  # noqa: BLE001 - fall back to the untranslated text
        log.warning("Translation to %s failed; returning original text", lang, exc_info=True)
        return {"translatedText": text}

    _translation_cache[key] = translated
    if len(_translation_cache) > TRANSLATION_CACHE_SIZE:
        _translation_cache.popitem(last=False)
    return {"translatedText": translated}


@app.get("/api/simulation", dependencies=[Depends(require_user)])
async def get_simulation_data():
    import json

    path = BASE_DIR / "pipeline_results.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Simulation data not found.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log.exception("Could not read %s", path)
        raise HTTPException(status_code=500, detail="Simulation data could not be read.")


@app.get("/api/health")
async def health():
    return {"ok": True, "matlab": matlab_service.status}


if __name__ == "__main__":
    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "5000")), reload=False)
