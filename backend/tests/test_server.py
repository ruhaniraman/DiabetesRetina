"""Backend tests. MATLAB is disabled and the auth dependency is overridden, so no external services are needed."""
import os

os.environ["DISABLE_MATLAB"] = "true"

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402


@pytest.fixture()
def client():
    server.app.dependency_overrides[server.require_user] = lambda: None
    yield TestClient(server.app)
    server.app.dependency_overrides.clear()


def png_bytes(img):
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def fake_fundus(size=256, noise=True):
    """A dark square with a bright disc containing texture, roughly fundus-shaped."""
    rng = np.random.default_rng(0)
    img = np.zeros((size, size, 3), np.uint8)
    cv2.circle(img, (size // 2, size // 2), size // 2 - 8, (40, 90, 140), -1)
    if noise:
        texture = rng.integers(0, 40, (size, size, 3), dtype=np.uint8)
        mask = np.zeros((size, size), np.uint8)
        cv2.circle(mask, (size // 2, size // 2), size // 2 - 8, 255, -1)
        img = np.where(mask[..., None] > 0, cv2.add(img, texture), img)
    return img


def upload(name, img):
    return {"file": (name, png_bytes(img), "image/png")}


def test_requests_without_token_are_rejected():
    server.app.dependency_overrides.clear()
    r = TestClient(server.app).post("/api/stage1-quality", files=upload("a.png", fake_fundus()))
    assert r.status_code == 401


def test_health_is_public_and_reports_matlab_disabled():
    server.app.dependency_overrides.clear()
    r = TestClient(server.app).get("/api/health")
    assert r.status_code == 200 and r.json()["matlab"] == "disabled"


def test_quality_rejects_flat_blurry_image(client):
    flat = np.full((128, 128, 3), 100, np.uint8)
    r = client.post("/api/stage1-quality", files=upload("flat.png", flat))
    assert r.status_code == 200 and r.json()["verdict"] == "reject"


def test_quality_accepts_textured_image(client):
    r = client.post("/api/stage1-quality", files=upload("ok.png", fake_fundus()))
    assert r.status_code == 200 and r.json()["verdict"] in ("accept", "enhance")


def test_non_image_upload_is_a_400(client):
    r = client.post("/api/stage1-quality", files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 400


def test_hostile_filename_is_harmless(client):
    r = client.post("/api/stage1-quality", files={"file": ("../../evil.png", png_bytes(fake_fundus()), "image/png")})
    assert r.status_code == 200


def test_oversized_upload_is_a_413(client, monkeypatch):
    monkeypatch.setattr(server, "MAX_UPLOAD_BYTES", 100)
    r = client.post("/api/stage1-quality", files=upload("big.png", fake_fundus()))
    assert r.status_code == 413


def test_segmentation_returns_mask_and_counts(client):
    r = client.post("/api/stage2-segmentation", files=upload("f.png", fake_fundus()))
    body = r.json()
    assert r.status_code == 200
    assert body["maskUrl"].startswith("data:image/png;base64,")
    assert set(body["counts"]) == {"microaneurysms", "hemorrhages", "exudates"}


def test_segmentation_on_black_image_is_a_422_not_a_crash(client):
    r = client.post("/api/stage2-segmentation", files=upload("black.png", np.zeros((64, 64, 3), np.uint8)))
    assert r.status_code == 422


def test_stage3_and_stage4_report_503_without_matlab(client):
    files = {"leftEye": ("l.png", png_bytes(fake_fundus()), "image/png"), "rightEye": ("r.png", png_bytes(fake_fundus()), "image/png")}
    assert client.post("/api/stage3-assessment", files=files).status_code == 503
    assert client.post("/api/stage4-heatmap", files=upload("a.png", fake_fundus())).status_code == 503


@pytest.mark.parametrize("overall", ["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"])
def test_summary_is_grade_based_and_has_disclaimer(overall):
    text = server.build_summary(overall, overall, "No_DR")
    assert "screening aid" in text
    assert "eye" in text or overall == "No_DR"


def test_summary_names_only_the_affected_eye():
    assert "left eye" in server.build_summary("Moderate", "Moderate", "No_DR")
    assert "right" not in server.build_summary("Moderate", "Moderate", "No_DR").split("flagged in the")[1].split(".")[0]


def test_translation_passthrough_for_english(client):
    r = client.post("/api/translate-dynamic", json={"text": "hello", "targetLang": "en"})
    assert r.json() == {"translatedText": "hello"}


def test_translation_rejects_unknown_language(client):
    assert client.post("/api/translate-dynamic", json={"text": "hi", "targetLang": "xx"}).status_code == 422
