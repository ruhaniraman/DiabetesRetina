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
        
        # Calculate mean brightness for illumination check simulation
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
            # Salvagable exposure condition -> Trigger 'enhance' verdict (CLAHE)
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

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=5000, reload=True)