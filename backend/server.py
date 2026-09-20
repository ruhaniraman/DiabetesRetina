from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import argostranslate.package
import argostranslate.translate
import uvicorn
import json
import os
import cv2
import numpy as np
import shutil
import base64
import traceback

class TranslationRequest(BaseModel):
    text: str
    targetLang: str = "en"

def init_translation_models():
    print("Initializing offline translation packages...")
    try:
        argostranslate.package.update_package_index()
        available_packages = argostranslate.package.get_available_packages()

        target_languages = ["hi", "kn"]
        for lang in target_languages:
            pkg = next((p for p in available_packages if p.from_code == "en" and p.to_code == lang), None)
            if pkg:
                print(f"Downloading model: English -> {lang}")
                download_path = pkg.download()
                argostranslate.package.install_from_path(download_path)
        print("Translation models ready!")
    except Exception as e:
        print(f"Warning: Failed to auto-download translation packages: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_translation_models()
    yield

app = FastAPI(title="Retina Rescue Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

translation_cache = {}

@app.post("/api/translate-dynamic")
async def translate_dynamic(payload: TranslationRequest):
    text = payload.text
    target_lang = payload.targetLang

    if target_lang == "en" or not text.strip():
        return {"translatedText": text}

    cache_key = f"{target_lang}:{text}"
    if cache_key in translation_cache:
        return {"translatedText": translation_cache[cache_key]}

    try:
        translated_text = argostranslate.translate.translate(text, "en", target_lang)
        translation_cache[cache_key] = translated_text
        return {"translatedText": translated_text}
    except Exception as e:
        print(f"Translation Error: {e}")
        return {"translatedText": text}

@app.get("/api/simulation")
async def get_simulation_data():
    file_path = "pipeline_results.json"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Simulation data not found.")
    try:
        with open(file_path, "r") as f:
            data = json.load(f)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stage1-quality")
async def check_image_quality(file: UploadFile = File(...)):
    temp_file_path = f"temp_{file.filename}"
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        img = cv2.imread(temp_file_path, cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise ValueError("Invalid image file format.")
            
        laplacian_var = cv2.Laplacian(img, cv2.CV_64F).var()
        mean_brightness = np.mean(img)
        blur_threshold = 12.0
        is_blurry = laplacian_var < blur_threshold
        
        if is_blurry:
            result = {
                "verdict": "reject",
                "status": "rejected",
                "reason": f"Image rejected: High blur variance detected (Variance: {laplacian_var:.2f} < Threshold {blur_threshold}). Retinal features obscured.",
                "score": float(laplacian_var)
            }
        elif mean_brightness < 45.0 or mean_brightness > 210.0:
            result = {
                "verdict": "enhance",
                "status": "accepted",
                "reason": "Image is poorly illuminated but salvageable -- applying CLAHE enhancement.",
                "score": float(laplacian_var)
            }
        else:
            result = {
                "verdict": "accept",
                "status": "accepted",
                "reason": "Stage 1 quality check passed successfully.",
                "score": float(laplacian_var)
            }
            
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
            
        return result
    except Exception as e:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stage2-segmentation")
async def run_stage2_segmentation(file: UploadFile = File(...)):
    temp_file_path = f"temp_stage2_{file.filename}"
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        img = cv2.imread(temp_file_path)
        if img is None:
            raise ValueError("Invalid image file for segmentation.")
            
        H, W = img.shape[:2]
        total_pixels = H * W
        
        # 1. Create a circular mask of the fundus to ignore black background corners
        gray_orig = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, thresh_circle = cv2.threshold(gray_orig, 15, 255, cv2.THRESH_BINARY)
        # Find the main circular eye region
        kernel_circle = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
        thresh_circle = cv2.morphologyEx(thresh_circle, cv2.MORPH_CLOSE, kernel_circle)
        
        green = img[:, :, 1].astype(np.float32) / 255.0
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply((green * 255).astype(np.uint8)).astype(np.float32) / 255.0
        
        mask_img = np.zeros((H, W, 4), dtype=np.uint8)
        scale_factor = total_pixels / (512 * 512)

        # A. EXUDATES (Bright spots inside eye)
        blur_ex = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=15)
        bright_spots = enhanced - blur_ex
        bright_spots = cv2.bitwise_and(bright_spots, bright_spots, mask=thresh_circle)
        _, thresh_ex = cv2.threshold(bright_spots, np.percentile(bright_spots[thresh_circle > 0], 98), 1.0, cv2.THRESH_BINARY)
        num_labels_ex, labels_ex, stats_ex, _ = cv2.connectedComponentsWithStats((thresh_ex * 255).astype(np.uint8))
        for i in range(1, num_labels_ex):
            if (15 * scale_factor) <= stats_ex[i, cv2.CC_STAT_AREA] <= (600 * scale_factor):
                mask_img[labels_ex == i] = (153, 211, 52, 200) # Emerald Green

        # B. HEMORRHAGES (Dark regions inside eye, avoiding outer circle boundary)
        blur_he = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=8)
        dark_spots = blur_he - enhanced
        # Erode the circle mask slightly so it doesn't catch the outer boundary edge
        inner_circle = cv2.erode(thresh_circle, kernel_circle, iterations=2)
        dark_spots = cv2.bitwise_and(dark_spots, dark_spots, mask=inner_circle)
        
        _, thresh_he = cv2.threshold(dark_spots, np.percentile(dark_spots[inner_circle > 0], 97), 1.0, cv2.THRESH_BINARY)
        num_labels_he, labels_he, stats_he, _ = cv2.connectedComponentsWithStats((thresh_he * 255).astype(np.uint8))
        for i in range(1, num_labels_he):
            if (30 * scale_factor) <= stats_ex[i, cv2.CC_STAT_AREA] if i < len(stats_ex) else 30 <= stats_he[i, cv2.CC_STAT_AREA] <= (2000 * scale_factor):
                mask_img[labels_he == i] = (94, 63, 244, 200) # Rose Red

        # C. MICROANEURYSMS (Tiny dots)
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        tophat = cv2.morphologyEx(enhanced, cv2.MORPH_TOPHAT, kernel)
        tophat = cv2.bitwise_and(tophat, tophat, mask=inner_circle)
        _, thresh_ma = cv2.threshold(tophat, np.percentile(tophat[inner_circle > 0], 99.4), 1.0, cv2.THRESH_BINARY)
        num_labels_ma, labels_ma, stats_ma, _ = cv2.connectedComponentsWithStats((thresh_ma * 255).astype(np.uint8))
        for i in range(1, num_labels_ma):
            if (2 * scale_factor) <= stats_ma[i, cv2.CC_STAT_AREA] <= (80 * scale_factor):
                mask_img[labels_ma == i] = (36, 191, 251, 255) # Amber Yellow

        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

        _, buffer = cv2.imencode('.png', mask_img)
        b64_str = base64.b64encode(buffer).decode('utf-8')
        mask_url = f"data:image/png;base64,{b64_str}"

        return {"status": "success", "maskUrl": mask_url}

    except Exception as e:
        print("\n--- STAGE 2 SEGMENTATION ERROR ---")
        traceback.print_exc()
        print("----------------------------------\n")
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise HTTPException(status_code=500, detail=str(e))
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=5000, reload=True)