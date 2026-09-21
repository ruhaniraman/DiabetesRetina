"""The downloadable PDF report: its content, its wording guards, its privacy properties and its endpoint (MATLAB and the auth-server are faked)."""
import io
import os
import re
from pathlib import Path

os.environ["DISABLE_MATLAB"] = "true"
os.environ["ENABLE_LESION_OVERLAY"] = "true"   # same as test_server.py: whichever test file imports server first fixes this setting

import cv2  # noqa: E402
import numpy as np  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from pypdf import PdfReader  # noqa: E402
from synthetic import realistic_fundus  # noqa: E402

import clinical_text as ct  # noqa: E402
import report_pdf  # noqa: E402
import server  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent


def result(referable=True, escalated=False, warnings=None, source="model"):
    return {
        "status": "success", "leftGrade": "Stage 2 - Moderate", "rightGrade": "Stage 1 - Mild" if escalated else "Stage 0 - No DR detected",
        "leftConfidenceBand": "High", "rightConfidenceBand": "Moderate", "leftReferableProbability": 0.83, "rightReferableProbability": 0.31 if escalated else 0.04,
        "leftReferable": True, "rightReferable": escalated, "referable": referable, "referralThreshold": 0.2, "referralThresholdSource": source,
        "escalated": escalated, "overallRisk": "Moderate",
        "overallSummary": ct.build_summary("Moderate", "Moderate", "No_DR"), "qualityWarnings": warnings or [],
    }


def eyes(empty=False):
    def one(seed):
        img = realistic_fundus(seed=seed)
        return {"analysed": img, "heatmap": cv2.applyColorMap(img[..., 1], cv2.COLORMAP_JET), "heatmap_empty": empty}
    return {"left": one(1), "right": one(2)}


def text_of(pdf: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)


def squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


# ----------------------------------------------------------------------------------------------------- content
def test_the_report_is_a_pdf_with_both_eyes_the_result_and_the_disclaimer():
    pdf = report_pdf.build_report_pdf(result(), eyes(), patient={"name": "Asha Rao", "dob": "1972-05-12"})
    assert pdf.startswith(b"%PDF") and len(PdfReader(io.BytesIO(pdf)).pages) >= 1
    t = squash(text_of(pdf))
    for expected in ("Diabetic Retinopathy Screening Report", "Left eye (OS)", "Right eye (OD)", "REFERRAL RECOMMENDED", "Asha Rao", "1972-05-12",
                     "Stage 2 - Moderate", "83% (flagged at 20% or more)", "not a diagnosis", "can miss disease"):
        assert expected in t, expected
    assert "The server does not keep this report file" in t


def test_a_no_referral_report_says_it_does_not_rule_out_disease_and_is_not_reassuring():
    r = result(referable=False)
    r.update(leftReferable=False, leftReferableProbability=0.05, leftGrade="Stage 0 - No DR detected", overallSummary=ct.build_summary("No_DR", "No_DR", "No_DR"))
    t = squash(text_of(report_pdf.build_report_pdf(r, eyes())))
    assert "NO REFERRAL FLAGGED" in t and "does not rule out disease" in t


def test_an_eye_flagged_despite_a_milder_stage_is_explained():
    t = squash(text_of(report_pdf.build_report_pdf(result(escalated=True), eyes())))
    assert ct.PDF_TEXT["escalated_chip"] in t


def test_warnings_and_a_site_threshold_are_reported():
    t = squash(text_of(report_pdf.build_report_pdf(result(warnings=["Left eye: Image is slightly soft; results may be less reliable."], source="site"), eyes())))
    assert "Photograph quality: Left eye: Image is slightly soft" in t
    assert "set by this site" in t


def test_an_eye_that_was_not_flagged_says_its_map_is_not_a_finding():
    t = squash(text_of(report_pdf.build_report_pdf(result(), eyes())))
    assert t.count(ct.PDF_TEXT["heatmap_below_threshold_note"]) == 1          # only the right eye (score 4%), not the flagged left eye


def test_an_empty_heatmap_says_so():
    t = squash(text_of(report_pdf.build_report_pdf(result(), eyes(empty=True))))
    assert ct.PDF_TEXT["heatmap_empty_note"] in t


def test_raw_probabilities_and_lesion_claims_are_not_in_the_report():
    t = text_of(report_pdf.build_report_pdf(result(), eyes())).lower()
    assert "class probabilit" not in t and "microaneurysm" not in t and "haemorrhage" not in t and "exudate" not in t


def test_a_name_in_a_script_the_font_cannot_print_is_replaced_by_a_note_not_garbled():
    pdf = report_pdf.build_report_pdf(result(), eyes(), patient={"name": "आशा राव"})
    assert ct.PDF_TEXT["name_unprintable"] in squash(text_of(pdf))
    assert report_pdf.printable_name("José Núñez") == "José Núñez"


def test_markup_in_a_name_is_printed_literally_not_interpreted():
    t = text_of(report_pdf.build_report_pdf(result(), eyes(), patient={"name": "<b>Bold</b> & <i>Co</i>"}))
    assert "<b>Bold</b> & <i>Co</i>" in squash(t)


def test_the_pdf_metadata_holds_no_patient_details():
    pdf = report_pdf.build_report_pdf(result(), eyes(), patient={"name": "Asha Rao", "dob": "1972-05-12"})
    meta = " ".join(str(v) for v in (PdfReader(io.BytesIO(pdf)).metadata or {}).values())
    assert "Asha" not in meta and "1972" not in meta


# ----------------------------------------------------------------------------------------------------- wording
BANNED = [r"\bclear\b", r"\bnormal\b", r"\bhealthy\b", r"\bsafe\b", r"\bguarantee", r"\brequired\b", r"\bmust\b", r"you have\b", r"\bcure", r"\broutine\b"]


@pytest.mark.parametrize("key", list(ct.PDF_TEXT))
def test_pdf_wording_follows_the_wording_rules(key):
    text = ct.PDF_TEXT[key].lower()
    for pattern in BANNED:
        assert not re.search(pattern, text), f"{key}: {pattern!r}"


def test_the_whole_generated_report_has_no_banned_phrases():
    for r in (result(), result(referable=False), result(escalated=True)):
        t = squash(text_of(report_pdf.build_report_pdf(r, eyes()))).lower()
        for pattern in BANNED:
            assert not re.search(pattern, t), pattern


def _js_strings():
    src = (ROOT / "frontend" / "src" / "clinicalText.js").read_text(encoding="utf-8")
    return re.sub(r"['\"`+\s]", "", src)


@pytest.mark.parametrize("key", ["heatmap_note", "heatmap_empty_note", "heatmap_below_threshold_note", "confidence_note", "stage_note"])
def test_sentences_shared_with_the_web_app_have_not_drifted(key):
    """The web app's wording (frontend/src/clinicalText.js) and the PDF's must stay identical."""
    assert re.sub(r"['\"`+\s]", "", ct.PDF_TEXT[key]) in _js_strings(), f"{key} differs from frontend/src/clinicalText.js"


def test_the_spoken_result_words_match_the_pdf_result_badges():
    """What the Listen button says for an eye is the same wording as the PDF's per-eye result (frontend/src/clinicalText.js, SPEECH)."""
    src = (ROOT / "frontend" / "src" / "clinicalText.js").read_text(encoding="utf-8")
    block = re.search(r"export const SPEECH = \{(.*?)\n\};", src, re.S).group(1)
    flagged = re.search(r"flagged: '([^']*)'", block).group(1)
    not_flagged = re.search(r"notFlagged: '([^']*)'", block).group(1)
    clean = lambda s: re.sub(r"[^a-z ]", "", s.lower()).strip()
    assert clean(flagged) == clean(ct.PDF_TEXT["badge_referral"])
    assert clean(not_flagged) == clean(ct.PDF_TEXT["badge_no_referral"])


# ----------------------------------------------------------------------------------------------------- endpoint
@pytest.fixture()
def client(monkeypatch):
    server.app.dependency_overrides[server.require_user] = lambda: {"id": 7, "fullName": "T", "email": "t@example.com"}
    yield TestClient(server.app)
    server.app.dependency_overrides.clear()


def png(img):
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return buf.tobytes()


def files(left=None, right=None):
    return {"leftEye": ("l.png", png(realistic_fundus(seed=1) if left is None else left), "image/png"),
            "rightEye": ("r.png", png(realistic_fundus(seed=2) if right is None else right), "image/png")}


@pytest.fixture()
def fake_matlab(monkeypatch):
    calls = {"graded": 0, "heatmaps": 0, "saved": 0}

    def grade(l, r):
        calls["graded"] += 1
        return {"overall": "Moderate", "left": "Moderate", "right": "No_DR", "left_conf": 0.95, "right_conf": 0.8, "left_ref": 0.83, "right_ref": 0.04,
                "threshold": 0.2, "threshold_source": "model"}

    def heat(img, with_analysed=False):
        calls["heatmaps"] += 1
        h = cv2.applyColorMap(realistic_fundus(seed=3)[..., 1], cv2.COLORMAP_JET)
        return (h, 0.8, False, realistic_fundus(seed=4)) if with_analysed else (h, 0.8, False)

    async def record(*a, **k):
        calls["saved"] += 1
        return 1

    monkeypatch.setattr(server, "grade_eyes", grade)
    monkeypatch.setattr(server, "render_gradcam", heat)
    monkeypatch.setattr(server, "record_exam", record)
    return calls


def test_the_endpoint_returns_a_pdf_that_is_not_cached_and_names_no_one(client, fake_matlab):
    r = client.post("/api/report-pdf", files=files(), data={"patientName": "Asha Rao", "patientDob": "1972-05-12"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["content-disposition"] == 'attachment; filename="retina-rescue-report.pdf"'      # a fixed name: no patient details in it
    assert r.content.startswith(b"%PDF")
    t = squash(text_of(r.content))
    assert "Asha Rao" in t and "REFERRAL RECOMMENDED" in t and "Left eye (OS)" in t
    assert fake_matlab["graded"] == 1 and fake_matlab["heatmaps"] == 2


def test_generating_a_report_does_not_add_to_the_exam_history(client, fake_matlab):
    client.post("/api/report-pdf", files=files())
    assert fake_matlab["saved"] == 0


def test_patient_details_are_optional(client, fake_matlab):
    r = client.post("/api/report-pdf", files=files())
    assert r.status_code == 200 and "Not provided" in squash(text_of(r.content))


def test_the_stage_1_gate_applies_to_the_report(client, fake_matlab):
    r = client.post("/api/report-pdf", files=files(right=np.zeros((224, 224, 3), np.uint8)))
    assert r.status_code == 422 and r.json()["detail"].startswith("Right eye: ")
    same = realistic_fundus(seed=1)
    r = client.post("/api/report-pdf", files=files(left=same, right=same))
    assert r.status_code == 422 and "same picture" in r.json()["detail"]
    assert fake_matlab["graded"] == 0 and fake_matlab["heatmaps"] == 0


@pytest.mark.parametrize("data", [
    {"patientDob": "12/05/1972"}, {"patientDob": "2999-01-01"}, {"patientDob": "1850-01-01"},
    {"patientName": "x" * 101}, {"patientName": "line\nbreak"},
])
def test_bad_patient_details_are_refused_before_any_work(client, fake_matlab, data):
    r = client.post("/api/report-pdf", files=files(), data=data)
    assert r.status_code == 422
    assert fake_matlab["graded"] == 0


def test_the_report_needs_a_signed_in_user():
    server.app.dependency_overrides.clear()
    assert TestClient(server.app).post("/api/report-pdf", files=files()).status_code == 401


def test_without_matlab_the_report_is_a_503_not_a_crash(client):
    assert client.post("/api/report-pdf", files=files()).status_code == 503


def test_a_failure_while_drawing_is_a_500_with_no_detail_leak(client, fake_matlab, monkeypatch):
    monkeypatch.setattr(server, "build_report_pdf", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("secret internals")))
    r = client.post("/api/report-pdf", files=files())
    assert r.status_code == 500 and "secret" not in r.text
