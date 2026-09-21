"""Guard rails on clinical wording (see the principles at the top of clinical_text.py).

These do not make the wording clinically correct: only a clinician can do that. They stop specific risky phrasing from
creeping back in unnoticed, and they fail loudly when the wording changes so the review packet gets regenerated.
"""
import itertools
import os
import re

os.environ["DISABLE_MATLAB"] = "true"

import pytest  # noqa: E402

import clinical_text as ct  # noqa: E402

RAW = {"left_conf": 0.9, "right_conf": 0.9, "left_ref": 0.05, "right_ref": 0.05, "threshold": 0.2}


def scenarios():
    """Every distinct summary the backend can produce."""
    out = {}
    for left, right in itertools.product(ct.GRADE_ORDER, repeat=2):
        overall = max(left, right, key=ct.GRADE_ORDER.index)
        out[f"{left}/{right}"] = ct.build_summary(overall, left, right)
    for left, right in [("Mild", "No_DR"), ("No_DR", "Mild"), ("Mild", "Mild"), ("No_DR", "No_DR")]:
        d = {"escalated": True, "threshold": 0.2, "left_ref": 0.35, "right_ref": 0.31, "left_flagged": True, "right_flagged": left == "Mild" and right == "Mild"}
        out[f"escalated {left}/{right}"] = ct.build_summary("Moderate", left, right, decision=d)
    out["unknown grade"] = ct.build_summary("Mystery", "Mystery", "No_DR")
    return out


ALL = scenarios()

# Words that reassure, diagnose, or promise. "clear"/"normal"/"healthy" read as "you are fine".
BANNED = [
    r"\bclear\b", r"\bnormal\b", r"\bhealthy\b", r"\ball clear\b", r"\bsafe\b", r"\bguarantee", r"\bno action\b",
    r"\broutine\b", r"no urgent referral", r"\bcleared\b", r"\brequired\b", r"\bmust\b", r"you have\b", r"\bcure",
    r"\bconfirm(s|ed)? (that )?you\b",
]
# Specific clinical timings that no qualified person has approved for this tool.
TIMINGS = [r"\bannual", r"\b\d+\s*[-to]*\s*\d*\s*(day|week|month|year)s?\b", r"\bevery (year|month|\d)"]


@pytest.mark.parametrize("name", ALL)
def test_no_reassuring_or_prescriptive_words(name):
    text = ALL[name].lower()
    for pattern in BANNED:
        assert not re.search(pattern, text), f"{name}: banned phrase {pattern!r} in: {ALL[name]}"


@pytest.mark.parametrize("name", ALL)
def test_no_unapproved_clinical_timings(name):
    text = ALL[name].lower()
    for pattern in TIMINGS:
        assert not re.search(pattern, text), f"{name}: specific timing {pattern!r} in: {ALL[name]}"


@pytest.mark.parametrize("name", ALL)
def test_every_summary_ends_with_the_disclaimer_that_the_tool_can_miss_disease(name):
    assert ALL[name].endswith(ct.DISCLAIMER)
    assert "not a diagnosis" in ALL[name] and "can miss disease" in ALL[name]


def test_a_nothing_detected_result_says_it_does_not_rule_out_disease():
    text = ct.build_summary("No_DR", "No_DR", "No_DR")
    assert "does not rule out disease" in text
    assert "seek review sooner" in text          # a safety net for symptoms


@pytest.mark.parametrize("grade", ["Moderate", "Severe", "Proliferate_DR"])
def test_referable_results_recommend_a_specialist_and_never_instruct(grade):
    text = ct.build_summary(grade, grade, "No_DR")
    assert "recommended" in text and "referral" in text.lower()
    assert "URGENT" in text if grade != "Moderate" else "URGENT" not in text


def test_the_mild_result_defers_the_follow_up_interval_to_a_professional():
    text = ct.build_summary("Mild", "Mild", "No_DR")
    assert "ask them how often" in text and not any(re.search(p, text.lower()) for p in TIMINGS)


def test_stage_labels_never_call_a_result_clear():
    assert all("clear" not in v.lower() for v in ct.STAGE_LABELS.values())
    assert ct.STAGE_LABELS["No_DR"] == "Stage 0 - No DR detected"


def test_confidence_is_reported_as_a_band():
    assert [ct.confidence_band(p) for p in (0.99, 0.90, 0.89, 0.70, 0.69, 0.2)] == ["High", "High", "Moderate", "Moderate", "Low", "Low"]


# ---- the summary as parts + a renderer: the web app reads the summary aloud in Hindi/Kannada from reviewed sentences chosen by these parts
def test_the_english_summary_is_exactly_what_the_parts_render():
    for name, text in ALL.items():
        assert isinstance(text, str) and text
    for left, right in itertools.product(ct.GRADE_ORDER, repeat=2):
        overall = max(left, right, key=ct.GRADE_ORDER.index)
        parts = ct.summary_parts(overall, left, right)
        assert ct.render_summary(parts) == ct.build_summary(overall, left, right)
        assert parts["kind"] == overall and (overall == "No_DR" or parts["eyes"])
    d = {"escalated": True, "threshold": 0.2, "left_ref": 0.35, "right_ref": 0.31, "left_flagged": True, "right_flagged": True}
    parts = ct.summary_parts("Moderate", "Mild", "Mild", decision=d)
    assert parts == {"kind": "escalated", "worst": "Mild", "eyes": ["left", "right"], "thresholdPercent": 20, "scorePercents": [35, 31]}
    assert ct.render_summary(parts) == ct.build_summary("Moderate", "Mild", "Mild", decision=d)


def test_an_unknown_grade_is_a_fallback_part_so_the_web_app_never_guesses_a_translation():
    assert ct.summary_parts("Mystery", "Mystery", "No_DR") == {"kind": "fallback", "overall": "Mystery"}
