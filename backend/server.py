from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import argostranslate.package
import argostranslate.translate
import uvicorn

# Request Schema
class TranslationRequest(BaseModel):
    text: str
    targetLang: str = "en"

# Download and initialize offline models on startup
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

# Lifespan Context Manager (FastAPI Modern Startup/Shutdown Handler)
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_translation_models()
    yield

app = FastAPI(title="Retina Rescue Backend", lifespan=lifespan)

# Enable CORS for React Frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory translation cache
translation_cache = {}

@app.post("/api/translate-dynamic")
async def translate_dynamic(payload: TranslationRequest):
    text = payload.text
    target_lang = payload.targetLang

    # Return original text if language is English or text is empty
    if target_lang == "en" or not text.strip():
        return {"translatedText": text}

    # Check cache first
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

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=5000, reload=True)