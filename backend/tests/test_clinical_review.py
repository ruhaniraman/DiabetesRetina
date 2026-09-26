"""Keeps the clinician review packet honest: it must match the real wording, and the captured PDF text must match its source."""
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
STAGE4_JSON = ROOT / "docs" / "clinical_text_stage4.json"
SOURCE = ROOT / "stage4_explainability" / "report" / "formatReportText.m"

# Same guard rails as test_clinical_text.py, applied to the PDF text captured from MATLAB.
BANNED = [r"\bclear\b", r"\bnormal\b", r"\bhealthy\b", r"\bsafe\b", r"\broutine\b", r"no urgent referral", r"\brequired\b", r"\bmust\b", r"you have\b", r"\bdiagnostic\b"]
TIMINGS = [r"\bannual", r"\b\d+\s*[-to]*\s*\d*\s*(day|week|month|year)s?\b"]


def captured():
    return json.loads(STAGE4_JSON.read_text(encoding="utf-8"))


def test_captured_pdf_text_matches_the_matlab_source():
    """Fails if formatReportText.m was edited without re-running docs/tools/export_stage4_text.py."""
    current = hashlib.sha256(SOURCE.read_bytes().replace(bytes([13, 10]), bytes([10]))).hexdigest()
    assert captured()["source_sha256"] == current, "formatReportText.m changed: run python docs/tools/export_stage4_text.py, then build_clinical_review.py"


def test_pdf_wording_passes_the_same_guard_rails():
    for case in captured()["cases"]:
        for key, value in case["text"].items():
            for pattern in BANNED + TIMINGS:
                assert not re.search(pattern, str(value).lower()), f"{case['case']} / {key}: {pattern!r} in {value!r}"


def test_no_referral_pdf_text_never_reassures():
    for case in captured()["cases"]:
        if not case["isReferable"]:
            assert "does not rule out disease" in case["text"]["referralLine"]
            assert "NO REFERRAL FLAGGED" in case["text"]["referralLine"]


def test_severe_and_proliferative_are_marked_urgent_in_the_pdf_like_the_app():
    for case in captured()["cases"]:
        if case["isReferable"] and case["grade"] in ("Severe", "Proliferate_DR"):
            assert "URGENT" in case["text"]["referralLine"]
        if case["grade"] == "Moderate":
            assert "URGENT" not in case["text"]["referralLine"]


def test_pdf_disclaimer_says_the_tool_can_miss_disease_and_is_not_clinically_validated():
    disclaimer = captured()["cases"][0]["text"]["disclaimer"]
    assert "can miss disease" in disclaimer and "not been clinically validated" in disclaimer


@pytest.mark.skipif(shutil.which("node") is None, reason="node is needed to read the web app's wording")
@pytest.mark.skipif(not (ROOT / "docs" / "CLINICAL_REVIEW.md").exists(), reason="the review packet is kept local (gitignored) until the review")
def test_the_review_packet_is_up_to_date():
    """Fails when any wording, or the validation numbers, changed without regenerating docs/CLINICAL_REVIEW.md."""
    r = subprocess.run([sys.executable, str(ROOT / "docs" / "tools" / "build_clinical_review.py"), "--check"], capture_output=True, text=True, timeout=180)
    assert r.returncode == 0, r.stderr or r.stdout
