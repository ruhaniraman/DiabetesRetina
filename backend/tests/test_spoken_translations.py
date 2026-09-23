"""The fixed sentences read aloud in Hindi and Kannada (frontend/src/speech/translations.json).

The English half is a copy of the server's wording; these tests fail if the two drift. The Hindi and Kannada halves must have exactly the same shape and blanks as the
English, and they are drafts until a person has reviewed them (docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md).
"""
import itertools
import json
import os
import re
from pathlib import Path

os.environ["DISABLE_MATLAB"] = "true"

import pytest  # noqa: E402

import clinical_text as ct  # noqa: E402
import quality  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = json.loads((ROOT / "frontend" / "src" / "speech" / "translations.json").read_text(encoding="utf-8"))
EN = DATA["en"]


def fill(template: str, **values) -> str:
    return re.sub(r"\{(\w+)\}", lambda m: str(values.get(m.group(1), m.group(0))), template)


def spoken_summary_from_table(table: dict, parts: dict) -> str:
    """The same steps as buildTranslatedScript in frontend/src/speech/translations.js, for the summary sentence."""
    unit = lambda n: f"{n}{table['percent']}"
    listed = parts.get("eyes") or []
    eyes = table["eyesIn"]["both" if len(listed) > 1 else listed[0]] if listed else ""
    if parts["kind"] == "escalated":
        text = fill(table["summary"]["escalated"], worst=table["stageText"][parts["worst"]], eyes=eyes, threshold=unit(parts["thresholdPercent"]),
                    scores=", ".join(unit(p) for p in parts["scorePercents"]))
    else:
        text = fill(table["summary"][parts["kind"]], eyes=eyes)
    return f"{text} {table['disclaimer']}"


# ----------------------------------------------------------------------------------------------------- the English source matches the server
def test_english_summaries_are_exactly_the_servers_for_every_grade_pair():
    for left, right in itertools.product(ct.GRADE_ORDER, repeat=2):
        overall = max(left, right, key=ct.GRADE_ORDER.index)
        parts = ct.summary_parts(overall, left, right)
        assert spoken_summary_from_table(EN, parts) == ct.render_summary(parts), (left, right)


@pytest.mark.parametrize("flagged", [["left"], ["right"], ["left", "right"]])
@pytest.mark.parametrize("worst", ["No_DR", "Mild"])
def test_english_escalated_summary_is_exactly_the_servers(flagged, worst):
    d = {"escalated": True, "threshold": 0.2, "left_ref": 0.35, "right_ref": 0.31, "left_flagged": "left" in flagged, "right_flagged": "right" in flagged}
    parts = ct.summary_parts("Moderate", worst, worst, decision=d)
    assert spoken_summary_from_table(EN, parts) == ct.render_summary(parts)


def test_english_stage_labels_grades_and_warnings_match_the_server():
    assert EN["stageText"] == ct.STAGE_TEXT
    for number, key in enumerate(ct.GRADE_ORDER):
        assert EN["grades"][str(number)] == ct.STAGE_LABELS[key].replace(" - ", ", ")
    warn = {code: text for code, text in quality.MESSAGES.items() if code.endswith("_warn")}
    assert EN["warnings"] == warn                  # every photograph-quality warning the server can send has a fixed sentence, and no more


def test_the_fixed_english_lines_are_the_ones_in_the_web_apps_wording_file():
    src = (ROOT / "frontend" / "src" / "clinicalText.js").read_text(encoding="utf-8")
    block = re.search(r"export const SPEECH = \{(.*?)\n\};", src, re.S).group(1)
    for key in ("intro", "left", "right", "flagged", "notFlagged", "photos"):
        assert re.search(rf"{key}: '([^']*)'", block).group(1) == EN[key], key


def test_the_disclaimer_is_the_servers_disclaimer():
    assert EN["disclaimer"] == ct.DISCLAIMER.strip()


# ----------------------------------------------------------------------------------------------------- the translations have the same shape
def shape(value):
    return {k: shape(v) for k, v in value.items()} if isinstance(value, dict) else "text"


@pytest.mark.parametrize("lang", ["hi", "kn", "ta"])
def test_a_translation_has_exactly_the_same_sentences_and_blanks_as_english(lang):
    assert shape(DATA[lang]) == shape(EN)
    blanks = lambda t: sorted(re.findall(r"\{(\w+)\}", t))
    for key, text in EN["summary"].items():
        assert blanks(DATA[lang]["summary"][key]) == blanks(text), (lang, key)


@pytest.mark.parametrize("lang", ["hi", "kn", "ta"])
def test_every_translated_sentence_is_in_the_right_script_and_not_empty(lang):
    script = {"hi": r"[ऀ-ॿ]", "kn": r"[ಀ-೿]", "ta": r"[஀-௿]"}[lang]

    def sentences(v):
        return [x for item in v.values() for x in (sentences(item) if isinstance(item, dict) else [item])]

    for text in sentences({k: v for k, v in DATA[lang].items()}):
        assert text.strip() and re.search(script, text), f"{lang}: {text!r}"


def test_the_translations_are_flagged_as_unreviewed_until_a_person_signs_them_off():
    assert DATA["reviewed"] == {"hi": False, "kn": False, "ta": False}


def test_no_reassuring_or_prescriptive_english_in_the_source_sentences():
    banned = [r"\bclear\b", r"\bnormal\b", r"\bhealthy\b", r"\bsafe\b", r"\bguarantee", r"\brequired\b", r"\bmust\b", r"you have\b", r"\bcure"]
    text = json.dumps(EN).lower()
    for pattern in banned:
        assert not re.search(pattern, text), pattern


# ----------------------------------------------------------------------------------------------------- the review sheet is up to date
def test_the_review_sheet_is_up_to_date():
    import subprocess
    import sys

    tool = ROOT / "docs" / "tools" / "build_translation_review.py"
    sheet = ROOT / "docs" / "SPOKEN_TRANSLATIONS_FOR_REVIEW.md"
    before = sheet.read_text(encoding="utf-8") if sheet.exists() else ""
    out = subprocess.run([sys.executable, str(tool), "--check"], capture_output=True, text=True, cwd=str(ROOT))
    assert out.returncode == 0, "docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md is out of date: run python docs/tools/build_translation_review.py\n" + out.stdout + out.stderr
    assert sheet.read_text(encoding="utf-8") == before
