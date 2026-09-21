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
    server.app.dependency_overrides[server.require_user] = lambda: {"id": 7, "fullName": "T", "email": "t@example.com"}
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


# --- exam history recording -------------------------------------------------------------------------
def raw(overall, left, right, left_conf, right_conf, left_ref, right_ref, threshold=0.2):
    """What grade_eyes returns (the raw network output)."""
    return {"overall": overall, "left": left, "right": right, "left_conf": left_conf, "right_conf": right_conf,
            "left_ref": left_ref, "right_ref": right_ref, "threshold": threshold}


def two_images():
    return {
        "leftEye": ("l.png", png_bytes(fake_fundus()), "image/png"),
        "rightEye": ("r.png", png_bytes(fake_fundus()), "image/png"),
    }


def test_stage3_saves_the_exam_for_the_calling_user(client, monkeypatch):
    saved = {}

    async def fake_record(user_id, exam):
        saved["user_id"], saved["exam"] = user_id, exam
        return 42

    monkeypatch.setattr(server, "grade_eyes", lambda l, r: raw("Moderate", "Moderate", "No_DR", 0.9, 0.8, 0.92, 0.03))
    monkeypatch.setattr(server, "record_exam", fake_record)
    body = client.post("/api/stage3-assessment", files=two_images()).json()

    assert body["saved"] is True and body["examId"] == 42
    assert saved["user_id"] == 7
    assert saved["exam"]["overallRisk"] == "Moderate" and saved["exam"]["leftGrade"] == "Stage 2 - Moderate"
    assert "screening aid" in saved["exam"]["summary"]


def test_a_failed_save_never_hides_the_result(client, monkeypatch):
    async def failing_record(user_id, exam):
        return None

    monkeypatch.setattr(server, "grade_eyes", lambda l, r: raw("Severe", "Severe", "Mild", 0.9, 0.8, 0.97, 0.10))
    monkeypatch.setattr(server, "record_exam", failing_record)
    body = client.post("/api/stage3-assessment", files=two_images()).json()
    assert body["overallRisk"] == "Severe" and body["saved"] is False and body["examId"] is None


def test_record_exam_sends_the_service_key_and_handles_failures(monkeypatch):
    import asyncio

    calls = []

    class FakeResp:
        status_code = 201
        text = ""

        def json(self):
            return {"id": 9}

    class FakeClient:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False

        async def post(self, url, headers=None, json=None):
            calls.append((url, headers, json))
            return FakeResp()

    monkeypatch.setattr(server.httpx, "AsyncClient", FakeClient)

    monkeypatch.setattr(server, "SERVICE_KEY", "")
    assert asyncio.run(server.record_exam(1, {})) is None and not calls  # no key configured: skipped

    monkeypatch.setattr(server, "SERVICE_KEY", "secret")
    assert asyncio.run(server.record_exam(1, {"a": 1})) == 9
    url, headers, payload = calls[0]
    assert url.endswith("/api/internal/exams") and headers == {"X-Service-Key": "secret"}
    assert payload == {"userId": 1, "exam": {"a": 1}}

    FakeResp.status_code = 401
    assert asyncio.run(server.record_exam(1, {})) is None  # refused: reported as not saved, not raised


# --- production hardening ------------------------------------------------------------------------------
GOOD_PROD_ENV = {
    "SERVICE_KEY": "s" * 40,
    "CLIENT_ORIGINS": "https://retina.example.org",
    "AUTH_SERVER_URL": "http://127.0.0.1:4000",
    "HOST": "127.0.0.1",
}


def test_production_accepts_a_sound_configuration():
    assert server.production_problems(GOOD_PROD_ENV) == []


def test_production_rejects_unsafe_settings():
    p = server.production_problems
    assert any("SERVICE_KEY" in x for x in p({**GOOD_PROD_ENV, "SERVICE_KEY": ""}))
    assert any("SERVICE_KEY" in x for x in p({**GOOD_PROD_ENV, "SERVICE_KEY": "replace-with-something-long-enough-1234567"}))
    for origin in ("http://retina.example.org", "https://localhost:5173", "", "https://ok.example,http://bad.example"):
        assert any("CLIENT_ORIGINS" in x for x in p({**GOOD_PROD_ENV, "CLIENT_ORIGINS": origin})), origin
    assert any("AUTH_SERVER_URL" in x for x in p({**GOOD_PROD_ENV, "AUTH_SERVER_URL": ""}))
    assert any("https" in x for x in p({**GOOD_PROD_ENV, "AUTH_SERVER_URL": "http://auth.internal.example:4000"}))
    assert p({**GOOD_PROD_ENV, "AUTH_SERVER_URL": "https://auth.internal.example"}) == []
    assert any("HOST" in x for x in p({**GOOD_PROD_ENV, "HOST": "0.0.0.0"}))
    assert p({**GOOD_PROD_ENV, "HOST": "0.0.0.0", "ALLOW_PUBLIC_BIND": "true"}) == []


def _run_python(code, **env):
    import subprocess, sys

    full = {**os.environ, "DISABLE_MATLAB": "true", **env}
    return subprocess.run([sys.executable, "-c", code], cwd=os.path.dirname(server.__file__), env=full, capture_output=True, text=True, timeout=120)


def test_production_start_is_refused_with_dev_settings():
    r = _run_python("import server", APP_ENV="production", SERVICE_KEY="", CLIENT_ORIGINS="http://localhost:5173")
    assert r.returncode != 0 and "Refusing to start in production" in r.stderr


def test_api_docs_are_only_available_in_development():
    probe = (
        "import server\n"
        "from fastapi.testclient import TestClient\n"
        "c = TestClient(server.app)\n"
        "print([c.get(p).status_code for p in ('/docs', '/redoc', '/openapi.json')])\n"
    )
    dev = _run_python(probe, APP_ENV="development")
    assert dev.stdout.strip().endswith("[200, 200, 200]"), dev.stderr[-500:]
    prod = _run_python(probe, APP_ENV="production", **GOOD_PROD_ENV)
    assert prod.stdout.strip().endswith("[404, 404, 404]"), prod.stderr[-500:]


def test_responses_are_not_cacheable(client):
    r = client.get("/api/health")
    assert r.headers["cache-control"] == "no-store" and r.headers["x-content-type-options"] == "nosniff"


# --- referral decision (threshold), validated in validation/REPORT.md -------------------------------------
def test_threshold_flags_a_referable_eye_that_the_most_likely_grade_would_miss():
    d = server.decide(raw("Mild", "Mild", "No_DR", 0.45, 0.9, 0.35, 0.02))
    assert d["referable"] and d["left_flagged"] and not d["right_flagged"]
    assert d["escalated"] and d["overall"] == "Moderate"   # never shown as a routine "Mild"


def test_a_clear_result_stays_clear():
    d = server.decide(raw("No_DR", "No_DR", "No_DR", 0.9, 0.9, 0.05, 0.08))
    assert not d["referable"] and not d["escalated"] and d["overall"] == "No_DR"


def test_the_displayed_grade_is_never_lowered():
    d = server.decide(raw("Severe", "Severe", "No_DR", 0.6, 0.9, 0.10, 0.02))  # threshold not reached, grade is Severe
    assert d["overall"] == "Severe" and d["referable"] and d["left_flagged"] and not d["escalated"]


def test_threshold_is_at_least_as_sensitive_as_the_most_likely_grade():
    """With the deployed threshold (0.2 = 1/5), any eye whose top class is referable is also flagged by the threshold."""
    import numpy as np

    rng = np.random.default_rng(0)
    classes = ["Mild", "Moderate", "No_DR", "Proliferate_DR", "Severe"]
    referable = {"Moderate", "Proliferate_DR", "Severe"}
    for probs in rng.dirichlet(np.ones(5) * 0.3, 5000):
        top = classes[int(probs.argmax())]
        ref_prob = sum(p for c, p in zip(classes, probs) if c in referable)
        if top in referable:
            assert ref_prob >= 0.2


def test_escalated_summary_explains_itself_and_never_reads_as_routine():
    d = server.decide(raw("Mild", "Mild", "No_DR", 0.45, 0.9, 0.35, 0.02))
    text = server.build_summary(d["overall"], d["left"], d["right"], decision=d)
    assert "left eye" in text and "35%" in text and "20%" in text
    assert "treated as referable" in text and "estimate" in text
    assert "routine" not in text.lower().replace("repeat screening", "") or "not" in text
    assert "can miss disease" in text


def test_disclaimer_says_the_tool_can_miss_disease():
    assert "can miss disease" in server.build_summary("No_DR", "No_DR", "No_DR")


def test_endpoint_returns_referral_fields_and_saves_the_escalated_grade(client, monkeypatch):
    saved = {}

    async def fake_record(user_id, exam):
        saved.update(exam)
        return 5

    monkeypatch.setattr(server, "grade_eyes", lambda l, r: raw("Mild", "Mild", "No_DR", 0.45, 0.9, 0.35, 0.02))
    monkeypatch.setattr(server, "record_exam", fake_record)
    body = client.post("/api/stage3-assessment", files=two_images()).json()
    assert body["referable"] is True and body["escalated"] is True and body["overallRisk"] == "Moderate"
    assert body["leftReferable"] is True and body["rightReferable"] is False
    assert body["leftReferableProbability"] == 0.35 and body["referralThreshold"] == 0.2
    assert body["leftGrade"].startswith("Stage 1")            # the per-eye estimate is still reported honestly
    assert saved["overallRisk"] == "Moderate" and "treated as referable" in saved["summary"]
