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


def _eyes(names: list[str]) -> str:
    return " and ".join(names) + (" eye" if len(names) == 1 else " eyes")


def build_summary(overall: str, left: str, right: str, *, decision: dict | None = None) -> str:
    """Grade- and threshold-based wording only: it never claims lesions the model was not asked about."""
    if decision and decision["escalated"]:
        worst = left if GRADE_ORDER.index(left) >= GRADE_ORDER.index(right) else right
        flagged = [e for e in ("left", "right") if decision[f"{e}_flagged"]]
        return ESCALATED_TEMPLATE.format(
            worst=STAGE_TEXT[worst],
            threshold=f"{decision['threshold']:.0%}",
            eyes=_eyes(flagged),
            probabilities=", ".join(f"{decision[f'{e}_ref']:.0%}" for e in flagged),
        ) + DISCLAIMER

    affected = [name for name, grade in (("left", left), ("right", right)) if grade == overall]
    template = SUMMARY_TEMPLATES.get(overall)
    if template is None:
        return FALLBACK_TEMPLATE.format(overall=overall) + DISCLAIMER
    return template.format(eyes=_eyes(affected)) + DISCLAIMER
