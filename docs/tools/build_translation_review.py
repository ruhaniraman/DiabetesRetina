"""Generate docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md: every sentence the Listen button can speak, in English and the Hindi and Kannada drafts, for a qualified reviewer.

    python docs/tools/build_translation_review.py            # write the sheet
    python docs/tools/build_translation_review.py --check    # exit 1 if the sheet is out of date (used by a test)
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = json.loads((ROOT / "frontend" / "src" / "speech" / "translations.json").read_text(encoding="utf-8"))
OUT = ROOT / "docs" / "SPOKEN_TRANSLATIONS_FOR_REVIEW.md"

LABELS = {
    "intro": "Introduction", "draftNotice": "Announcement that the words are a draft (spoken first while unreviewed)", "left": "Left eye", "right": "Right eye",
    "flagged": "Eye result: referral recommended", "notFlagged": "Eye result: no referral flagged", "photos": "Before a photograph-quality warning",
    "percent": "Unit after a percentage", "disclaimer": "Disclaimer, spoken after the summary",
}


def rows():
    en = DATA["en"]
    out = []
    for key in ("intro", "draftNotice", "left", "right", "flagged", "notFlagged", "photos", "percent", "disclaimer"):
        out.append((LABELS[key], en[key], DATA["hi"][key], DATA["kn"][key]))
    for k, v in en["eyesIn"].items():
        out.append((f"'in the {k} eye(s)' (fills {{eyes}})", v, DATA["hi"]["eyesIn"][k], DATA["kn"]["eyesIn"][k]))
    for k, v in en["grades"].items():
        out.append((f"Stage label {k}", v, DATA["hi"]["grades"][k], DATA["kn"]["grades"][k]))
    for k, v in en["stageText"].items():
        out.append((f"Stage in words: {k} (fills {{worst}})", v, DATA["hi"]["stageText"][k], DATA["kn"]["stageText"][k]))
    for k, v in en["summary"].items():
        out.append((f"Summary: {k}", v, DATA["hi"]["summary"][k], DATA["kn"]["summary"][k]))
    for k, v in en["warnings"].items():
        out.append((f"Photograph warning: {k}", v, DATA["hi"]["warnings"][k], DATA["kn"]["warnings"][k]))
    return out


def cell(text):
    return text.replace("|", "\\|").replace("\n", " ")


def build():
    reviewed = DATA["reviewed"]
    L = ["# Spoken Hindi and Kannada: sentences for review", "",
         "The **Listen to the result** button reads the result aloud. In English it reads the server's own wording. In Hindi and Kannada it reads the fixed sentences below "
         "(`frontend/src/speech/translations.json`), chosen by which result the server produced. **Machine translation is not used for speech**: the machine translator has no "
         "Kannada model at all, and its Hindi mistranslated safety-critical sentences (for example \"the tool can miss disease\" came out as \"can remember the disease\", "
         "and \"Right eye\" as \"correct eye\").", "",
         "**The Hindi and Kannada below are drafts written without a clinician or a medical translator.** Speech in each language is switched OFF until it is marked reviewed:", "",
         f"- Hindi: {'REVIEWED' if reviewed['hi'] else 'NOT reviewed (speech off)'}",
         f"- Kannada: {'REVIEWED' if reviewed['kn'] else 'NOT reviewed (speech off)'}", "",
         "## What to check", "",
         "1. **Meaning.** Each sentence must say what the English says, no more and no less. Pay closest attention to: \"does not rule out disease / can miss disease\" (it must not read as "
         "reassurance or as \"remembers disease\"), \"referral recommended\" (a recommendation, not an order), \"URGENT\", and left versus right.",
         "2. **Plain words.** People who cannot read will only hear this. Prefer short, everyday words a rural listener uses; keep the medical terms people are likely to hear at the clinic.",
         "3. **Grammar with the blanks.** `{eyes}` is already a full phrase (for example \"in the left eye\"); `{worst}`, `{threshold}` and `{scores}` are filled in. Read the summary "
         "aloud with a blank filled in to check it sounds natural for one eye and for both.",
         "4. **How it sounds.** Listen on a real phone with a real voice; text that reads well can sound wrong (numbers, English medical words, sentence breaks).", "",
         "## How to switch a language on", "",
         "Correct the sentences in `frontend/src/speech/translations.json`, have the reviewer sign the table at the end of this sheet, then set that language to `true` under `\"reviewed\"`, "
         "run `python docs/tools/build_translation_review.py` to regenerate this sheet, and update the guard test `test_the_translations_are_flagged_as_unreviewed...` "
         "(and its frontend twin in `src/speech/translations.test.js`), which exist so that this cannot happen by accident.", "",
         "## The sentences", "", "| Where it is used | English (source, matches the server) | Hindi (draft) | Kannada (draft) |", "|---|---|---|---|"]
    for where, en, hi, kn in rows():
        L.append(f"| {cell(where)} | {cell(en)} | {cell(hi)} | {cell(kn)} |")
    L += ["", "Numbers are written as digits plus the unit above (for example \"20 प्रतिशत\"); the phone's voice reads the digits.", "",
          "## Sign-off", "",
          "| Language | Reviewer name and qualification | Date | Corrections made in translations.json? | Switched on by |", "|---|---|---|---|---|",
          "| Hindi | | | | |", "| Kannada | | | | |", "",
          "A signature here means the reviewer has read every sentence above for that language. It does not clinically validate the screening tool.", ""]
    return "\n".join(L)


if __name__ == "__main__":
    text = build()
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        sys.exit(0 if current == text else 1)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} ({len(text.splitlines())} lines)")
