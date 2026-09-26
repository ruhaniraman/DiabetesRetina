"""Backend tests. MATLAB is disabled and the auth dependency is overridden, so no external services are needed."""
import os

os.environ["DISABLE_MATLAB"] = "true"
os.environ["ENABLE_LESION_OVERLAY"] = "true"   # the overlay tests below exercise it; default-off is tested separately

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import server  # noqa: E402
from synthetic import realistic_fundus  # noqa: E402


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


def test_quality_accepts_a_good_photo_and_never_offers_to_enhance_it(client):
    from synthetic import realistic_fundus

    r = client.post("/api/stage1-quality", files=upload("ok.png", realistic_fundus()))
    body = r.json()
    assert r.status_code == 200 and body["verdict"] == "accept" and body["status"] == "accepted"
    assert "enhanc" not in body["reason"].lower()


def test_quality_warns_about_a_dark_photo_but_still_accepts_it(client):
    from synthetic import realistic_fundus

    body = client.post("/api/stage1-quality", files=upload("dark.png", realistic_fundus(brightness=0.4))).json()
    assert body["verdict"] == "warn" and body["status"] == "accepted" and "less reliable" in body["reason"]
    assert body["reasons"] == ["dark_warn"]


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


EVIDENCE = {"heQuadrants": 2.0, "heQuadrantsWith20": 0.0, "heByQuadrant": [[1.0, 0.0, 2.0, 0.0]], "onlyMA": False, "exNearFovea": True, "foveaFrom": "disc"}


def fake_lesion_matlab(counts=(3, 1, 5, 0), areas=(0.05, 0.2, 1.1, 0.0)):
    """Stands in for MATLAB's lesionOverlayToFile: writes the overlay (and composite) PNGs and returns 1x4 values shaped like matlab.double."""
    calls = []

    def call(name, src, dst, *rest, nargout=1):
        calls.append(name)
        img = cv2.imread(src)
        overlay = np.zeros((*img.shape[:2], 4), np.uint8)
        overlay[10:20, 10:20] = (94, 63, 244, 200)
        cv2.imwrite(dst, overlay)
        if rest:
            cv2.imwrite(rest[0], cv2.resize(img, (448, 448)))
        return [list(counts)], [list(areas)], dict(EVIDENCE)

    return call, calls


def test_segmentation_returns_the_overlay_counts_and_areas_from_matlab(client, monkeypatch):
    call, calls = fake_lesion_matlab()
    monkeypatch.setattr(server.matlab_service, "call", call)
    r = client.post("/api/stage2-segmentation", files=upload("f.png", realistic_fundus(seed=1)))
    body = r.json()
    assert r.status_code == 200 and calls == ["lesionOverlayToFile"]
    assert body["maskUrl"].startswith("data:image/png;base64,") and body["method"] == "unet-v2"
    assert body["counts"] == {"microaneurysms": 3, "hemorrhages": 1, "exudates": 5, "softExudates": 0}
    assert body["areaPercent"]["exudates"] == 1.1
    assert body["evidence"] == {"heQuadrants": 2, "heQuadrantsWith20": 0, "heByQuadrant": [1, 0, 2, 0], "onlyMA": False, "exNearFovea": True, "foveaFrom": "disc"}


def test_the_overlay_keeps_its_transparency(monkeypatch):
    call, _ = fake_lesion_matlab()
    monkeypatch.setattr(server.matlab_service, "call", call)
    overlay, counts, areas, evidence, composite = server.render_lesions(realistic_fundus(seed=1), True)
    assert overlay.shape[2] == 4 and overlay[..., 3].max() == 200 and overlay[0, 0, 3] == 0
    assert composite.shape == (448, 448, 3) and sum(counts.values()) == 9


def test_a_photo_is_rendered_once_for_the_report_page_and_the_stored_pdf(monkeypatch):
    call, calls = fake_lesion_matlab()
    monkeypatch.setattr(server.matlab_service, "call", call)
    img = realistic_fundus(seed=1)
    view = server.render_lesions(img)                  # the report page's lesion view
    overlay, counts, _areas, _ev, composite = server.render_lesions(img, True)   # the PDF kept with the exam
    assert calls == ["lesionOverlayToFile"] and len(view) == 4 and composite is not None and counts == view[1]
    server.render_lesions(realistic_fundus(seed=2))
    assert len(calls) == 2


def test_concurrent_requests_for_one_photo_share_a_single_render():
    import threading, time

    runs = []

    def slow():
        runs.append(1)
        time.sleep(0.2)
        return ("done",)

    img = realistic_fundus(seed=3)
    threads = [threading.Thread(target=server.render_cache.get, args=("gradcam", img, slow)) for _ in range(3)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(runs) == 1


def test_a_failed_render_is_not_cached():
    img = realistic_fundus(seed=4)
    with pytest.raises(RuntimeError):
        server.render_cache.get("gradcam", img, lambda: (_ for _ in ()).throw(RuntimeError("MATLAB failed")))
    assert server.render_cache.get("gradcam", img, lambda: ("ok",)) == ("ok",)


def test_segmentation_applies_the_stage_1_gate_before_matlab(client, monkeypatch):
    call, calls = fake_lesion_matlab()
    monkeypatch.setattr(server.matlab_service, "call", call)
    r = client.post("/api/stage2-segmentation", files=upload("black.png", np.zeros((64, 64, 3), np.uint8)))
    assert r.status_code == 422 and calls == []


def test_segmentation_without_matlab_is_a_503(client):
    assert client.post("/api/stage2-segmentation", files=upload("f.png", realistic_fundus(seed=1))).status_code == 503


def test_a_matlab_failure_in_stage_2_is_a_500_with_no_detail_leak(client, monkeypatch):
    monkeypatch.setattr(server.matlab_service, "call", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("secret internals")))
    r = client.post("/api/stage2-segmentation", files=upload("f.png", realistic_fundus(seed=1)))
    assert r.status_code == 500 and "secret" not in r.text


def fake_anatomy_matlab(source="detected"):
    """Stands in for MATLAB's anatomyOverlayToFile: writes the overlay PNG and returns a struct (dict) like the engine does."""
    calls = []

    def call(name, src, dst, nargout=1):
        calls.append(name)
        img = cv2.imread(src)
        overlay = np.zeros((*img.shape[:2], 4), np.uint8)
        overlay[5:9, :] = (238, 211, 34, 170)
        cv2.imwrite(dst, overlay)
        return {"disc": [[120.0, 200.0]], "discDiameter": 60.0, "fovea": [[270.0, 205.0]], "foveaSource": source,
                "foveaConfidence": 0.81 if source == "detected" else float("nan"), "vesselDensity": 11.234, "vesselMethod": "unet"}

    return call, calls


def test_anatomy_returns_overlay_and_landmarks(client, monkeypatch):
    call, calls = fake_anatomy_matlab()
    monkeypatch.setattr(server.matlab_service, "call", call)
    r = client.post("/api/stage2-anatomy", files=upload("f.png", realistic_fundus(seed=1)))
    body = r.json()
    assert r.status_code == 200 and calls == ["anatomyOverlayToFile"]
    assert body["overlayUrl"].startswith("data:image/png;base64,")
    assert body["disc"] == [120.0, 200.0] and body["fovea"] == [270.0, 205.0] and body["discDiameter"] == 60.0
    assert body["foveaSource"] == "detected" and body["foveaConfidence"] == 0.81
    assert body["vesselDensity"] == 11.23 and body["vesselMethod"] == "unet"


def test_anatomy_without_a_detected_fovea_has_no_confidence(client, monkeypatch):
    call, _ = fake_anatomy_matlab(source="disc")
    monkeypatch.setattr(server.matlab_service, "call", call)
    body = client.post("/api/stage2-anatomy", files=upload("f.png", realistic_fundus(seed=1))).json()
    assert body["foveaSource"] == "disc" and body["foveaConfidence"] is None


def test_anatomy_applies_the_stage_1_gate_and_needs_matlab(client, monkeypatch):
    assert client.post("/api/stage2-anatomy", files=upload("f.png", realistic_fundus(seed=1))).status_code == 503
    call, calls = fake_anatomy_matlab()
    monkeypatch.setattr(server.matlab_service, "call", call)
    r = client.post("/api/stage2-anatomy", files=upload("black.png", np.zeros((64, 64, 3), np.uint8)))
    assert r.status_code == 422 and calls == []


def test_enhancement_returns_the_matlab_image_and_needs_matlab(client, monkeypatch):
    assert client.post("/api/stage1-enhance", files=upload("f.png", realistic_fundus(seed=1))).status_code == 503
    calls = []

    def call(name, src, dst, nargout=0):
        calls.append(name)
        cv2.imwrite(dst, 255 - cv2.imread(src))

    monkeypatch.setattr(server.matlab_service, "call", call)
    r = client.post("/api/stage1-enhance", files=upload("f.png", realistic_fundus(seed=1)))
    assert r.status_code == 200 and calls == ["enhanceToFile"]
    assert r.json()["imageUrl"].startswith("data:image/jpeg;base64,") and r.json()["displayOnly"] is True


def test_simulation_run_passes_the_scenario_to_simulink(client, monkeypatch):
    import json
    seen = {}

    def call(name, payload, nargout=1):
        seen["name"], seen["payload"] = name, json.loads(payload)
        return json.dumps({"meetsTargets": True, "reasons": [], "stages": {}})

    body = {"overrides": {"patientsPerYear": 150000, "specificity": 0.744}, "resources": {"cameraSites": 12, "uplinkMbps": 0.1, "aiServers": 1, "reviewers": 1}}
    assert client.post("/api/simulation/run", json=body).status_code == 503
    monkeypatch.setattr(server.matlab_service, "call", call)
    r = client.post("/api/simulation/run", json=body)
    assert r.status_code == 200 and r.json()["meetsTargets"] is True
    assert seen["name"] == "simulateScenarioJson"
    assert seen["payload"] == {"overrides": {"patientsPerYear": 150000.0, "specificity": 0.744}, "resources": body["resources"]}


def test_simulation_run_rejects_out_of_range_inputs(client):
    bad = {"overrides": {"specificity": 3}, "resources": {"cameraSites": 12, "uplinkMbps": 0.1, "aiServers": 1, "reviewers": 1}}
    assert client.post("/api/simulation/run", json=bad).status_code == 422
    assert client.post("/api/simulation/run", json={"resources": {"cameraSites": 0, "uplinkMbps": 0.1, "aiServers": 1, "reviewers": 1}}).status_code == 422


def test_stage3_and_stage4_report_503_without_matlab(client):
    assert client.post("/api/stage3-assessment", files=two_images()).status_code == 503
    assert client.post("/api/stage4-heatmap", files=upload("a.png", realistic_fundus(seed=1))).status_code == 503


@pytest.mark.parametrize("overall", ["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"])
def test_summary_is_grade_based_and_has_disclaimer(overall):
    text = server.build_summary(overall, overall, "No_DR")
    assert "screening aid" in text
    assert "eye" in text or overall == "No_DR"


def test_summary_names_only_the_affected_eye():
    text = server.build_summary("Moderate", "Moderate", "No_DR")
    assert "left eye" in text and "right" not in text.lower()


def test_translation_passthrough_for_english(client):
    r = client.post("/api/translate-dynamic", json={"text": "hello", "targetLang": "en"})
    assert r.json() == {"translatedText": "hello"}


def test_translation_rejects_unknown_language(client):
    assert client.post("/api/translate-dynamic", json={"text": "hi", "targetLang": "xx"}).status_code == 422


# --- exam history recording -------------------------------------------------------------------------
def raw(overall, left, right, left_conf, right_conf, left_ref, right_ref, threshold=0.2):
    """What grade_eyes returns (the raw network output)."""
    return {"overall": overall, "left": left, "right": right, "left_conf": left_conf, "right_conf": right_conf,
            "left_ref": left_ref, "right_ref": right_ref, "threshold": threshold, "threshold_source": "model"}


def two_images():
    """Two different photographs that pass the Stage 1 gate (uploading one picture twice is refused)."""
    return {
        "leftEye": ("l.png", png_bytes(realistic_fundus(seed=1)), "image/png"),
        "rightEye": ("r.png", png_bytes(realistic_fundus(seed=2)), "image/png"),
    }


def test_the_assessment_carries_the_parts_of_the_summary_for_reviewed_translations(client, monkeypatch):
    monkeypatch.setattr(server, "grade_eyes", lambda l, r: raw("Moderate", "Moderate", "No_DR", 0.9, 0.8, 0.85, 0.03))
    body = client.post("/api/stage3-assessment", files=two_images()).json()
    assert body["summaryParts"] == {"kind": "Moderate", "eyes": ["left"]}
    assert server.render_summary(body["summaryParts"]) == body["overallSummary"]


def test_heatmap_endpoint_explains_the_referral_score(client, monkeypatch):
    monkeypatch.setattr(server, "render_gradcam", lambda img: (np.zeros((224, 224, 3), np.uint8), 0.42, False))
    body = client.post("/api/stage4-heatmap", files=upload("a.png", realistic_fundus(seed=1))).json()
    assert body["status"] == "success" and body["method"] == "gradcam-referral"
    assert body["referralScore"] == 0.42 and body["empty"] is False and body["heatmapUrl"].startswith("data:image/png;base64,")


def test_heatmap_endpoint_refuses_a_picture_that_would_not_be_graded(client, monkeypatch):
    monkeypatch.setattr(server, "render_gradcam", lambda img: pytest.fail("MATLAB must not run"))
    r = client.post("/api/stage4-heatmap", files=upload("black.png", np.zeros((224, 224, 3), np.uint8)))
    assert r.status_code == 422 and "fundus" in r.json()["detail"]


def test_grading_refuses_an_unfit_picture_and_names_the_eye(client, monkeypatch):
    called = []
    monkeypatch.setattr(server, "grade_eyes", lambda *a: called.append(a))
    files = two_images()
    files["rightEye"] = ("r.png", png_bytes(np.zeros((224, 224, 3), np.uint8)), "image/png")
    r = client.post("/api/stage3-assessment", files=files)
    assert r.status_code == 422 and r.json()["detail"].startswith("Right eye: ")
    files = two_images()
    files["leftEye"] = ("l.png", png_bytes(cv2.GaussianBlur(realistic_fundus(seed=1), (0, 0), 3)), "image/png")
    r = client.post("/api/stage3-assessment", files=files)
    assert r.status_code == 422 and r.json()["detail"].startswith("Left eye: ")
    assert called == []                                       # the model was never run


def test_grading_refuses_the_same_picture_for_both_eyes(client, monkeypatch):
    monkeypatch.setattr(server, "grade_eyes", lambda *a: pytest.fail("the model must not run"))
    same = png_bytes(realistic_fundus(seed=1))
    reencoded = cv2.imencode(".jpg", realistic_fundus(seed=1), [cv2.IMWRITE_JPEG_QUALITY, 60])[1].tobytes()
    for other, name in ((same, "png"), (reencoded, "jpeg")):
        r = client.post("/api/stage3-assessment", files={"leftEye": ("l.png", same, "image/png"), "rightEye": ("r." + name, other, "image/" + name)})
        assert r.status_code == 422 and "same picture" in r.json()["detail"]


def test_a_warning_photo_is_graded_and_the_warning_is_returned(client, monkeypatch):
    monkeypatch.setattr(server, "grade_eyes", lambda l, r: raw("No_DR", "No_DR", "No_DR", 0.9, 0.9, 0.05, 0.05))
    files = two_images()
    files["leftEye"] = ("l.png", png_bytes(realistic_fundus(seed=1, brightness=0.4)), "image/png")      # dark: warn, not reject
    body = client.post("/api/stage3-assessment", files=files).json()
    assert body["status"] == "success" and len(body["qualityWarnings"]) == 1 and body["qualityWarnings"][0].startswith("Left eye: ")
    assert client.post("/api/stage3-assessment", files=two_images()).json()["qualityWarnings"] == []


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


# --- the lesion overlay is off unless enabled ----------------------------------------------------------------
def test_lesion_overlay_is_disabled_by_default(client, monkeypatch):
    monkeypatch.setattr(server, "LESION_OVERLAY_ENABLED", False)
    r = client.post("/api/stage2-segmentation", files=upload("f.png", fake_fundus()))
    assert r.status_code == 404 and "turned off" in r.json()["detail"]


def test_health_reports_whether_the_overlay_is_on(client, monkeypatch):
    monkeypatch.setattr(server, "LESION_OVERLAY_ENABLED", False)
    assert client.get("/api/health").json()["lesionOverlay"] is False


def test_the_overlay_default_is_off_when_the_variable_is_unset():
    import subprocess, sys

    env = {k: v for k, v in os.environ.items() if k != "ENABLE_LESION_OVERLAY"} | {"DISABLE_MATLAB": "true"}
    # A developer's backend/.env may turn the overlay on; the default is what CI and a fresh checkout get, so .env is not loaded here.
    code = "import dotenv; dotenv.load_dotenv = lambda *a, **k: False; import server; print(server.LESION_OVERLAY_ENABLED)"
    r = subprocess.run([sys.executable, "-c", code], cwd=os.path.dirname(server.__file__), env=env, capture_output=True, text=True, timeout=120)
    assert r.stdout.strip().endswith("False"), r.stderr[-300:]


# --- site-calibrated referral threshold (calibration/README.md) ----------------------------------------------
@pytest.mark.parametrize("value, expected", [(None, None), ("", None), ("  ", None), ("0.15", 0.15), (" 0.3 ", 0.3), ("0.02", 0.02), ("0.6", 0.6)])
def test_threshold_override_parsing_accepts_sensible_values(value, expected):
    assert server.parse_threshold_override(value) == expected


@pytest.mark.parametrize("value", ["abc", "0.01", "0.61", "1", "-0.2", "0,2", "nan"])
def test_threshold_override_parsing_refuses_unsafe_or_garbled_values(value):
    with pytest.raises(ValueError):
        server.parse_threshold_override(value)


def test_an_invalid_override_stops_the_server_with_a_clear_message():
    r = _run_python("import server", REFERRAL_THRESHOLD="0.9")
    assert r.returncode != 0 and "Invalid REFERRAL_THRESHOLD" in r.stderr and "outside the accepted range" in r.stderr


def test_without_an_override_the_models_own_threshold_is_used(monkeypatch):
    monkeypatch.setattr(server, "REFERRAL_THRESHOLD_OVERRIDE", None)
    monkeypatch.setattr(server.matlab_service, "call", lambda *a, **k: ("Mild", "Mild", "No_DR", 0.9, 0.9, 0.15, 0.02, 0.2, 0.01, 0.002))
    g = server.grade_eyes(fake_fundus(), fake_fundus())
    assert g["threshold"] == 0.2 and g["threshold_source"] == "model"
    assert g["left_pdr"] == 0.01 and g["right_pdr"] == 0.002


def test_the_assessment_reports_the_proliferative_probability_when_known(client, monkeypatch):
    monkeypatch.setattr(server, "grade_eyes", lambda l, r: raw("Moderate", "Moderate", "No_DR", 0.9, 0.8, 0.85, 0.03) | {"left_pdr": 0.31, "right_pdr": float("nan")})
    body = client.post("/api/stage3-assessment", files=two_images()).json()
    assert body["leftProliferativeProbability"] == 0.31 and body["rightProliferativeProbability"] is None


def test_a_site_threshold_replaces_the_model_threshold_and_changes_who_is_flagged(client, monkeypatch):
    call = lambda *a, **k: ("Mild", "Mild", "No_DR", 0.9, 0.9, 0.15, 0.02, 0.2, 0.01, 0.002)    # left referral score 0.15
    monkeypatch.setattr(server.matlab_service, "call", call)
    monkeypatch.setattr(server, "REFERRAL_THRESHOLD_OVERRIDE", None)
    default = client.post("/api/stage3-assessment", files=two_images()).json()
    assert default["referable"] is False and default["referralThreshold"] == 0.2 and default["referralThresholdSource"] == "model"

    monkeypatch.setattr(server, "REFERRAL_THRESHOLD_OVERRIDE", 0.10)                 # a more sensitive site setting
    site = client.post("/api/stage3-assessment", files=two_images()).json()
    assert site["referable"] is True and site["leftReferable"] is True
    assert site["referralThreshold"] == 0.10 and site["referralThresholdSource"] == "site"
    assert site["escalated"] is True and "10%" in site["overallSummary"]             # the text states the threshold that was applied


def test_health_reports_the_override(client, monkeypatch):
    monkeypatch.setattr(server, "REFERRAL_THRESHOLD_OVERRIDE", 0.12)
    assert client.get("/api/health").json()["referralThresholdOverride"] == 0.12


def test_stage1_can_run_in_matlab_and_falls_back_to_python(client, monkeypatch):
    monkeypatch.setattr(server, "STAGE1_ENGINE", "matlab")
    calls = []

    def call(name, src, nargout=1):
        calls.append(name)
        return "warn", "The photo is slightly dark.", "dark_warn,disc_warn", 0.2

    monkeypatch.setattr(server.matlab_service, "call", call)
    body = client.post("/api/stage1-quality", files=upload("f.png", realistic_fundus(seed=1))).json()
    assert calls == ["assessFundusQualityFile"] and body["engine"] == "matlab"
    assert body["verdict"] == "warn" and body["reasons"] == ["dark_warn", "disc_warn"] and body["status"] == "accepted"

    def unavailable(*a, **k):
        raise server.HTTPException(status_code=503, detail="MATLAB Engine is unavailable")

    monkeypatch.setattr(server.matlab_service, "call", unavailable)
    body = client.post("/api/stage1-quality", files=upload("f.png", realistic_fundus(seed=1))).json()
    assert body["engine"] == "python" and body["verdict"] in ("accept", "warn")
