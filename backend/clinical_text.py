"""Every piece of clinical wording the backend shows to users, in one place.

WHY THIS FILE EXISTS: none of this wording has been reviewed by a clinician. Keeping it here means a reviewer can read,
change and sign off the text in one sitting (docs/CLINICAL_REVIEW.md is generated from this file), and tests guard against
risky phrasing creeping back in (backend/tests/test_clinical_text.py).

Principles applied while this text was written (a clinician should confirm or overrule them):
  * Never reassure. A "nothing found" result must say it does not rule out disease (the tool misses some cases).
  * Recommend, do not instruct. Say "is recommended", not "is required".
  * Do not give clinical timings (screening intervals) that nobody qualified has approved; defer to the patient's
    eye-care professional / local guidelines.
  * Say "detected/flagged by the screening model", never "you have".
  * Stage estimates are less reliable than the referral decision, and the text says so when it matters.
"""

DISCLAIMER = (
    " This is an automated screening aid, not a diagnosis, and it can miss disease: "
    "symptoms or a clinician's concern should always prompt review."
)

# Per-eye label shown in the interface. "Clear" was avoided on purpose: it reads as "healthy".
STAGE_LABELS = {
    "No_DR": "Stage 0 - No DR detected",
    "Mild": "Stage 1 - Mild",
    "Moderate": "Stage 2 - Moderate",
    "Severe": "Stage 3 - Severe",
    "Proliferate_DR": "Stage 4 - Proliferative",
}

STAGE_TEXT = {
    "No_DR": "no retinopathy (Stage 0)",
    "Mild": "mild retinopathy (Stage 1)",
    "Moderate": "moderate retinopathy (Stage 2)",
    "Severe": "severe retinopathy (Stage 3)",
    "Proliferate_DR": "proliferative retinopathy (Stage 4)",
}

GRADE_ORDER = ["No_DR", "Mild", "Moderate", "Severe", "Proliferate_DR"]

# Confidence is reported as a band, not a percentage: the model's raw probabilities are over-confident (on held-out data
# the "Moderate" band claims ~81% but is right ~75% of the time). Thresholds match stage4_explainability/report/formatReportText.m.
CONFIDENCE_BANDS = (("High", 0.90), ("Moderate", 0.70), ("Low", 0.0))


def confidence_band(probability: float) -> str:
    for name, minimum in CONFIDENCE_BANDS:
        if probability >= minimum:
            return name
    return "Low"


NO_RULE_OUT = "This does not rule out disease, because the screening tool can miss it."

SUMMARY_TEMPLATES = {
    "No_DR": (
        "The screening model did not detect diabetic retinopathy in either eye. " + NO_RULE_OUT + " Continue regular eye screening as "
        "advised by your eye-care professional, and seek review sooner if you notice any change in your vision."
    ),
    "Mild": (
        "The screening model detected signs consistent with mild non-proliferative diabetic retinopathy (Stage 1) in the {eyes}. "
        "Follow-up with an eye-care professional is recommended; ask them how often you should be screened."
    ),
    "Moderate": (
        "The screening model detected signs consistent with moderate non-proliferative diabetic retinopathy (Stage 2) in the {eyes}. "
        "Referral to an eye specialist is recommended."
    ),
    "Severe": (
        "URGENT: the screening model detected signs consistent with severe non-proliferative diabetic retinopathy (Stage 3) in the {eyes}. "
        "Prompt referral to an ophthalmologist is recommended."
    ),
    "Proliferate_DR": (
        "URGENT: the screening model detected signs consistent with proliferative diabetic retinopathy (Stage 4) in the {eyes}. "
        "Prompt referral to an ophthalmologist is recommended."
    ),
}

ESCALATED_TEMPLATE = (
    "The most likely grade was {worst}, but the screening model's referral threshold ({threshold}) was reached in the "
    "{eyes} (referral score {probabilities}). This is treated as referable (Stage 2 or worse) until a clinician "
    "reviews it. The exact stage is an estimate; the referral decision is the more reliable result."
)

FALLBACK_TEMPLATE = "Bilateral analysis complete. Highest grade estimated by the screening model: {overall}. Review by an eye-care professional is recommended."


# --------------------------------------------------------------------------------------------------------------------
# The downloadable PDF report (backend/report_pdf.py). Sentences that also appear in the web app (frontend/src/clinicalText.js)
# must stay identical to it: backend/tests/test_report_pdf.py fails if they drift apart.
# --------------------------------------------------------------------------------------------------------------------
PDF_TEXT = {
    "kicker": "RETINARESCUE  •  AI SCREENING AID",
    "title": "Diabetic Retinopathy Screening Report",
    "badge_referral": "REFERRAL RECOMMENDED",
    "badge_no_referral": "NO REFERRAL FLAGGED",
    "photo_caption": "Photograph as analysed by the model (cropped to the retina)",
    "heatmap_caption": "Regions that raised this eye's referral score",
    "heatmap_note": (
        "Shows the regions that raised this eye's referral score, on a coarse grid. A rough guide, not a lesion detection: warm colours do not by themselves mean disease, "
        "and disease can be present outside them."
    ),
    "heatmap_below_threshold_note": "This eye's referral score is below the threshold, so it was not flagged. The map shows where the score was relatively highest, not a finding.",
    "heatmap_empty_note": "No region raised this eye's referral score, so nothing is highlighted. That does not rule out disease.",
    "confidence_note": (
        "Lower confidence means the grade is less likely to be right. In testing, the referral decision was wrong in about 1% of high-confidence "
        "results and about 15% of the rest."
    ),
    "stage_note": (
        "The referral decision is the more reliable output. On held-out test images it found about 95% of referable cases, while the exact stage "
        "matched the reference grade about 78% of the time. Results depend on the camera and population: on a second public dataset it flagged many more eyes that had no disease "
        "(see validation/REPORT.md)."
    ),
    "lesion_caption": "Possible lesions marked by the lesion model",
    "lesion_note": (
        "Coloured areas are possible lesions for a clinician to check, not findings. In testing, the lesion model marked something in about "
        "1 in 3 eyes that had no retinopathy, and it misses some lesions."
    ),
    "lesion_none_note": "The lesion model marked nothing in this photograph. That does not rule out disease.",
    "escalated_chip": "Referral flagged although the most likely stage is lower",
    "site_threshold_note": (
        "The referral threshold used here was set by this site from its own calibration, not the model's default. "
        "It is only appropriate if the site's clinical lead has approved it."
    ),
    "generated_note": "Generated on request from the photographs supplied. The server does not keep this report file.",
    "name_unprintable": "(name uses characters this report cannot print; see the application record)",
    "not_provided": "Not provided",
}


# Names of the lesion types the Stage 2 overlay marks (PDF count rows; the web app's report.<key> texts say the same).
LESION_LABELS = {
    "microaneurysms": "Possible microaneurysms",
    "hemorrhages": "Possible hemorrhages",
    "exudates": "Possible hard exudates",
    "softExudates": "Possible soft exudates",
}


def _eyes(names: list[str]) -> str:
    return " and ".join(names) + (" eye" if len(names) == 1 else " eyes")


def _percent(x: float) -> int:
    return int(format(x, ".0%")[:-1])


def summary_parts(overall: str, left: str, right: str, *, decision: dict | None = None) -> dict:
    """WHICH sentence the summary is, and its blanks, without the English words. The web app uses this to read the summary aloud from reviewed
    Hindi/Kannada sentences (frontend/src/speech/translations.json) instead of machine-translating it. render_summary(parts) gives back the English text."""
    if decision and decision["escalated"]:
        worst = left if GRADE_ORDER.index(left) >= GRADE_ORDER.index(right) else right
        flagged = [e for e in ("left", "right") if decision[f"{e}_flagged"]]
        return {"kind": "escalated", "worst": worst, "eyes": flagged, "thresholdPercent": _percent(decision["threshold"]),
                "scorePercents": [_percent(decision[f"{e}_ref"]) for e in flagged]}
    if overall not in SUMMARY_TEMPLATES:
        return {"kind": "fallback", "overall": overall}
    return {"kind": overall, "eyes": [name for name, grade in (("left", left), ("right", right)) if grade == overall]}


def render_summary(parts: dict) -> str:
    """The English summary for summary_parts()."""
    if parts["kind"] == "escalated":
        return ESCALATED_TEMPLATE.format(
            worst=STAGE_TEXT[parts["worst"]],
            threshold=f"{parts['thresholdPercent']}%",
            eyes=_eyes(parts["eyes"]),
            probabilities=", ".join(f"{p}%" for p in parts["scorePercents"]),
        ) + DISCLAIMER
    if parts["kind"] == "fallback":
        return FALLBACK_TEMPLATE.format(overall=parts["overall"]) + DISCLAIMER
    return SUMMARY_TEMPLATES[parts["kind"]].format(eyes=_eyes(parts["eyes"])) + DISCLAIMER


def build_summary(overall: str, left: str, right: str, *, decision: dict | None = None) -> str:
    """Grade- and threshold-based wording only: it never claims lesions the model was not asked about."""
    return render_summary(summary_parts(overall, left, right, decision=decision))
