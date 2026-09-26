"""Build docs/CLINICAL_REVIEW.md: everything a clinician needs to review the tool's wording in one sitting.

The packet is generated from the real code and the real validation data, never typed by hand, so it cannot drift from what
the app actually says or from the measured performance:

  * backend wording        -> backend/clinical_text.py (run for every scenario)
  * web-app wording        -> frontend/src/clinicalText.js (dumped with node)
  * PDF report wording     -> docs/clinical_text_stage4.json (captured from formatReportText.m; see export_stage4_text.py)
  * performance / failures -> validation/results/ (metrics.json and the prediction CSVs)

    python docs/tools/build_clinical_review.py            # write the packet
    python docs/tools/build_clinical_review.py --check    # exit 1 if the committed packet is out of date (used by tests)
"""
import csv
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("DISABLE_MATLAB", "true")
ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import numpy as np  # noqa: E402

import clinical_text as ct  # noqa: E402

sys.path.insert(0, str(ROOT / "validation"))
import calibration_eval  # noqa: E402  (temperature and threshold of the deployed model)

OUT = ROOT / "docs" / "CLINICAL_REVIEW.md"
RESULTS = ROOT / "validation" / "results"
STAGE4 = ROOT / "docs" / "clinical_text_stage4.json"
CLASSES = ["Mild", "Moderate", "No_DR", "Proliferate_DR", "Severe"]
REFERABLE = {"Moderate", "Severe", "Proliferate_DR"}


def frontend_text():
    out = subprocess.run(["node", str(ROOT / "frontend" / "scripts" / "dump-clinical-text.mjs")], capture_output=True, encoding="utf-8", check=True, cwd=ROOT / "frontend")
    return json.loads(out.stdout)


def stage4_source_hash():
    src = ROOT / "stage4_explainability" / "report" / "formatReportText.m"
    return hashlib.sha256(src.read_bytes().replace(bytes([13, 10]), bytes([10]))).hexdigest()


def quote(text):
    return "\n".join("> " + line if line else ">" for line in str(text).splitlines())


def pct(x, digits=1):
    return f"{x * 100:.{digits}f}%"


def calibration():
    """Confidence bands as the app computes them: the DEPLOYED model's test predictions, temperature-scaled (validation/calibration_eval.py);
    the referral decision uses the raw referral score at the deployed threshold."""
    rows = list(csv.DictReader(open(RESULTS / "deployed_test.csv", encoding="utf-8")))
    raw = np.array([[float(r[f"p_{c}"]) for c in CLASSES] for r in rows])
    p = calibration_eval.temperature_scale(raw, calibration_eval.TEMPERATURE)
    y = np.array([r["label"] for r in rows])
    top = p.max(1)
    correct = np.array([CLASSES[i] for i in p.argmax(1)]) == y
    truth = np.isin(y, list(REFERABLE))
    flagged = raw[:, [CLASSES.index(c) for c in REFERABLE]].sum(1) >= calibration_eval.THRESHOLD
    bands = []
    for name, lo, hi in (("High", 0.9, 1.01), ("Moderate", 0.7, 0.9), ("Low", 0.0, 0.7)):
        m = (top >= lo) & (top < hi)
        bands.append((name, int(m.sum()), float(top[m].mean()), float(correct[m].mean()), float((truth[m] != flagged[m]).mean())))
    high = top >= 0.9
    misses = {g: (int((y == g).sum()), int(((y == g) & ~flagged).sum())) for g in ("Moderate", "Severe", "Proliferate_DR")}
    return bands, float((truth[high] != flagged[high]).mean()), float((truth[~high] != flagged[~high]).mean()), misses


def build():
    metrics = json.loads((RESULTS / "metrics.json").read_text(encoding="utf-8"))
    ext = metrics["external_idrid_test"]
    ext_rate = ext["at_threshold"]
    thr = metrics["deployed_threshold"]
    web = frontend_text()
    s4 = json.loads(STAGE4.read_text(encoding="utf-8"))
    L = []
    add = L.append

    perf = metrics["performance"]["test (all)"]
    rate = perf["at_threshold"]
    clean = metrics["performance"]["test (excluding images duplicated in train/val)"]["at_threshold"]
    rules = metrics["rule_comparison"]
    argmax, thr_rule = rules["most-likely grade (argmax)"], rules["referable probability threshold"]
    pcr = metrics["per_class_recall_test"]
    missed = metrics["missed_severe_or_proliferate"]
    pv = metrics["predictive_values"]
    bands, err_high, err_rest, misses = calibration()

    add("# Clinical review packet\n")
    add("> **Status: NOT reviewed by a clinician.** This file exists so that a qualified reviewer can check everything the tool tells patients "
        "and staff in one sitting. It is generated from the code and the validation data (`python docs/tools/build_clinical_review.py`); "
        "do not edit it by hand. Until it is signed off, treat every message below as unreviewed draft text.\n")
    add("## Sign-off\n")
    add("| Reviewer (name, qualification) | Date | Scope reviewed | Outcome (approved / approved with changes / not approved) | Signature |\n|---|---|---|---|---|")
    add("| | | | | |\n| | | | | |\n")

    add("## 1. What the tool is, and what it decides\n")
    add("A screening aid for diabetic retinopathy (DR). For each eye it takes one fundus photograph and produces (a) an estimated **stage** "
        "(0 No DR, 1 Mild, 2 Moderate, 3 Severe, 4 Proliferative) and (b) a **referral score**: the model's summed probability of Moderate, Severe "
        "and Proliferative. An eye is **flagged for referral** when that score is at least "
        f"**{thr:.1%}** (chosen on validation images for 99% sensitivity). "
        "\"Referable\" therefore means moderate non-proliferative DR or worse; **macular oedema and other eye disease are not assessed.**\n")
    add("The patient-level result is the worse of the two eyes. If the threshold flags an eye whose most likely stage is milder than Stage 2, the "
        "overall result is **raised to Stage 2 and explained in the text** (an \"escalation\"), so a referable result can never appear routine.\n")

    add("## 2. How well it works (held-out APTOS test images; not clinical validation)\n")
    add(f"Full detail: `validation/REPORT.md`. Test set: {perf['n']} images never used in training ({perf['referable_n']} referable).\n")
    add("| Measure | Result |\n|---|---|")
    add(f"| Referable patients found (sensitivity) | **{pct(rate['sensitivity'])}** (95% CI {pct(rate['sensitivity_ci'][0])} to {pct(rate['sensitivity_ci'][1])}) |")
    add(f"| Non-referable correctly not flagged (specificity) | **{pct(rate['specificity'])}** ({pct(rate['specificity_ci'][0])} to {pct(rate['specificity_ci'][1])}) |")
    add(f"| Excluding test images duplicated in training | sensitivity {pct(clean['sensitivity'])}, specificity {pct(clean['specificity'])} |")
    add(f"| Exact stage correct (5 classes) | {pct(perf['accuracy_5class'])} |")
    add(f"| **Second dataset (IDRiD official test set, {ext['n']} photographs; the model trained on IDRiD's other photographs):** sensitivity | {pct(ext_rate['sensitivity'])} |")
    add(f"| **Second dataset (IDRiD):** specificity | **{pct(ext_rate['specificity'])}**: it flagged {pct(1 - ext_rate['specificity'], 0)} of the eyes without referable disease |")
    add(f"| Referable patients found if decided from the single most likely stage instead | {pct(argmax['sensitivity'])} (this is why the threshold rule is used) |\n")
    add("**Where it fails (test set):**\n")
    add(f"- Missed referable cases at the deployed threshold: {thr_rule['FN']} of {thr_rule['TP'] + thr_rule['FN']} "
        f"(Moderate {misses['Moderate'][1]} of {misses['Moderate'][0]}, Severe {misses['Severe'][1]} of {misses['Severe'][0]}, "
        f"Proliferative {misses['Proliferate_DR'][1]} of {misses['Proliferate_DR'][0]}).")
    for m in missed:
        add(f"- A **proliferative** case (`{m['id']}`) was called {m['predicted']} with referral score {m['referable_probability']:.2f}: the tool said nothing was flagged.")
    add(f"- The exact stage is unreliable at the severe end: only {pct(pcr['Severe'], 0)} of Severe and {pct(pcr['Proliferate_DR'], 0)} of Proliferative "
        "cases were graded as such (most were graded a neighbouring or two-away stage).")
    add(f"- **It does not transfer cleanly to other data.** On the second public dataset it found {pct(ext_rate['sensitivity'])} of referable patients but only "
        f"{pct(ext_rate['specificity'])} of healthy eyes were left unflagged, so a clinic using a different camera or population could see many false referrals. "
        "Nothing is known about other cameras, age groups or diabetes types. The reference grades themselves are imperfect (the same photograph appears with different grades).\n")
    add("**What a flag means in a real clinic** (positive predictive value falls as disease becomes rarer):\n")
    add("| Referable prevalence | Chance a flag is truly referable | Chance a \"no referral\" is truly fine | Flagged per 1,000 patients |\n|---|---|---|---|")
    for prev in ("0.2", "0.1", "0.05"):
        v = pv[prev]
        add(f"| {float(prev):.0%} | {pct(v['ppv'], 0)} | {pct(v['npv'], 1)} | {v['flagged_per_1000']:.0f} |")
    add("")
    add("**Confidence bands.** The interface shows High / Moderate / Low, not a percentage. The band comes from temperature-scaled probabilities "
        "(the raw network is over-confident; the temperature was fitted on validation images, see `validation/results/calibration.md`). Measured on the test set:\n")
    add("| Band (calibrated top probability) | Images | Model claims | Exact stage actually right | Referral decision wrong |\n|---|---|---|---|---|")
    for name, n, claimed, actual, err in bands:
        add(f"| {name} | {n} | {pct(claimed, 0)} | {pct(actual, 0)} | {pct(err)} |")
    add(f"\nThe referral decision was wrong in {pct(err_high)} of High-confidence results and {pct(err_rest)} of the rest.\n")

    add("## 3. Everything the tool says\n")
    add("### 3a. Result summary (shown on the dashboard, saved to the patient's history, and returned by the API)\n")
    add("Source: `backend/clinical_text.py`. Every summary ends with the standard disclaimer (quoted once at the end of this section).\n")
    for title, overall, left, right, decision in [
        ("Nothing detected in either eye", "No_DR", "No_DR", "No_DR", None),
        ("Mild in one eye (below the referral threshold)", "Mild", "Mild", "No_DR", None),
        ("Moderate in the left eye", "Moderate", "Moderate", "No_DR", None),
        ("Severe in the right eye", "Severe", "No_DR", "Severe", None),
        ("Proliferative in both eyes", "Proliferate_DR", "Proliferate_DR", "Proliferate_DR", None),
        ("Escalation: most likely stage is Mild, but the referral threshold is reached in the left eye", "Moderate", "Mild", "No_DR",
         {"escalated": True, "threshold": thr, "left_ref": 0.35, "right_ref": 0.02, "left_flagged": True, "right_flagged": False}),
    ]:
        add(f"**{title}**\n")
        text = ct.build_summary(overall, left, right, decision=decision).removesuffix(ct.DISCLAIMER)
        add(quote(text.strip()) + "\n")
    add("**Standard disclaimer appended to every summary:**\n")
    add(quote(ct.DISCLAIMER.strip()) + "\n")
    add("**Per-eye stage labels:** " + "; ".join(f"`{k}` → \"{v}\"" for k, v in ct.STAGE_LABELS.items()) + ".\n")

    add("### 3b. Web app screens\n")
    add("Source: `frontend/src/clinicalText.js`.\n")
    add("**Overall banner** (badge / title):\n")
    add("| Result | Badge | Title |\n|---|---|---|")
    for k, v in web["BANNER_TEXT"].items():
        add(f"| {k} | {v['badgeText']} | {v['title']} |")
    add("\n**Report page outcome** (what the reader is told to do):\n")
    add("| Outcome | Heading | Tag | Explanation |\n|---|---|---|---|")
    for k, v in web["TRIAGE"].items():
        add(f"| {k} | {v['title']} | {v['priority']} | {v['sub']} |")
    add(f"\nBasis line: \"{web['basisText']['withThreshold']}\".\n")
    add("**Other wording:**\n")
    for label, key in [("Before an assessment is run", "IDLE_NOTE"), ("On-screen disclaimer", "DISCLAIMER"),
                       ("Note when a heatmap is shown", "HEATMAP_NOTE"), ("Heatmap with nothing highlighted", "HEATMAP_EMPTY_NOTE"),
                       ("Shown when text is machine-translated", "TRANSLATION_NOTICE"), ("Chip on an eye flagged despite a milder stage", None)]:
        add(f"- **{label}:** " + (f"\"{web[key]}\"" if key else f"\"{web['REFERRAL_CHIP']['label']}\" (hover: \"{web['REFERRAL_CHIP']['hint']}\")"))
    add(f"- **Sign-in page:** \"{web['LOGIN_HERO']['text']}\"\n")

    add("### 3b-1. Listen (the result read aloud)\n")
    add("Source: `frontend/src/speech/reportScript.js`, fixed lines in `frontend/src/clinicalText.js` (`SPEECH`). A \"Listen to the result\" button on the dashboard and the report page reads the result aloud "
        "for people who cannot read it. **Nothing plays until the person taps.** The script is, in order: the introduction, the summary sentence(s) shown in 3a, one line per eye "
        "(the stage label, then \"Referral flagged.\" or \"No referral flagged.\") and any photograph-quality warning. Percentages and scores are not read out. The voice is one built into the phone "
        "or browser: only voices that run on the device are used (online voices, which send the text to a service, are refused so the result stays private). "
        "In Hindi and Kannada the button reads **fixed sentences** (`frontend/src/speech/translations.json`), chosen by which result the server produced, and never machine translation "
        "(the machine translator has no Kannada model, and its Hindi mistranslated safety-critical sentences). Those sentences are drafts, so **speech in Hindi and Kannada is switched off "
        "until a qualified person has reviewed them**; the sheet for that person is `docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md`. The words being read are always shown on the page, with the current sentence highlighted.\n")
    for label, key in [("Introduction", "intro"), ("Before the left eye line", "left"), ("Before the right eye line", "right"),
                       ("When an eye is flagged", "flagged"), ("When an eye is not flagged", "notFlagged"), ("Before each photograph-quality warning", "photos")]:
        add(f"- **{label}:** \"{web['SPEECH'][key]}\"")
    add("- **Question for the reviewer:** are the fixed Hindi and Kannada sentences (`docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md`) correct and clear enough to be read aloud to someone who cannot read them to check? "
        "Would recordings by a person be safer than a phone's synthetic voice?\n")

    add("### 3c. Image-quality messages (shown when a photo is checked)\n")
    add("Source: `backend/quality.py`. A photo is **rejected** (the user is asked to retake it) or **accepted with a warning**. "
        "The image is never altered: nothing is \"enhanced\". Thresholds and their evidence: `validation/QUALITY.md`.\n")
    import quality  # noqa: E402

    add("| Situation | Outcome | Message |\n|---|---|---|")
    labels = {
        "no_retina": ("No retina found", "reject"), "blur_reject": ("Very blurry", "reject"), "dark_reject": ("Very dark", "reject"),
        "bright_reject": ("Overexposed", "reject"), "noise_reject": ("Grainy or heavily compressed", "reject"),
        "not_colour_reject": ("Not a colour retinal photograph (greyscale, or no retinal colour)", "reject"),
        "partial_reject": ("Only part of the retina in the picture", "reject"),
        "same_picture": ("The same photo uploaded for both eyes (checked when grading)", "reject"),
        "colour_warn": ("Unusual colour balance", "warn"),
        "disc_warn": ("Optic disc not clearly visible", "warn"),
        "blur_warn": ("Slightly soft", "warn"), "dark_warn": ("Dark", "warn"), "bright_warn": ("Very bright", "warn"),
        "accept": ("Passes", "accept"),
    }
    for code, (situation, outcome) in labels.items():
        add(f"| {situation} | {outcome} | {quality.MESSAGES[code]} |")
    add("")

    add("### 3d. Downloadable PDF report (what a patient or clinician can save and print)\n")
    add("Source: `backend/report_pdf.py`, wording in `backend/clinical_text.py` (`PDF_TEXT`) plus the summary sentence shown in 3a. Created when the user presses "
        "\"Download PDF Report\": the server grades both photographs again, draws the heatmaps and returns the PDF. **It prints the patient's name and date of birth "
        "(if given) and both eyes' results.** That download is not kept and adds nothing to the exam history. Separately, each assessment saved to the exam history also gets its own copy of this PDF, built from the same result and stored encrypted with the exam; it ends with the \"kept with the exam history\" note below and is deleted with the exam, the health data or the account. Names in scripts the report font "
        "cannot print (for example Devanagari or Kannada) are replaced by a note. The report never shows raw class probabilities. Lesions appear only when the Stage 2 "
        "lesion overlay is turned on (section 3e), and then only as possible lesions with a caveat.\n")
    add("| Where | Text |\n|---|---|")
    for key, label in [("kicker", "Header"), ("title", "Title"), ("badge_referral", "Badge, referral flagged (red)"), ("badge_no_referral", "Badge, no referral flagged (neutral slate, not green)"),
                       ("photo_caption", "Caption under the analysed photograph"), ("heatmap_caption", "Caption under the heatmap"), ("heatmap_note", "Note under each eye"),
                       ("heatmap_empty_note", "Note when no region is highlighted"), ("heatmap_below_threshold_note", "Note under an eye that was not flagged"), ("escalated_chip", "Eye flagged although its most likely stage is milder"),
                       ("confidence_note", "Note on confidence"), ("stage_note", "Note on stage reliability"), ("site_threshold_note", "Note when the site set its own threshold"),
                       ("generated_note", "Last line of the notes"), ("generated_note_stored", "Last line of the notes, on the copy kept with the exam history"), ("name_unprintable", "Instead of a name the font cannot print"), ("not_provided", "When name or date of birth is missing")]:
        add(f"| {label} | {ct.PDF_TEXT[key]} |")
    add("\nPer eye the report lists: estimated stage (labelled an estimate), confidence band, referral score with the threshold, and the result for that eye. "
        "Any photograph-quality warnings are listed under \"Notes on this report\". The footer on every page reads \"Automated screening aid, not a diagnosis\".\n")
    add("- **Question for the reviewer:** should the PDF carry the patient's name and date of birth at all, and is the referral score percentage appropriate to print for patients?\n")

    add("### 3e. Stage 2 lesion overlay (off until this section is reviewed)\n")
    add("Source: wording in `backend/clinical_text.py` (`PDF_TEXT`, `LESION_LABELS`) and `frontend/src/clinicalText.js`; the overlay comes from "
        "`stage2_structure/dl/lesionOverlayToFile.m` (the calibrated v2 lesion network). It is shown only when `ENABLE_LESION_OVERLAY` (backend) and "
        "`VITE_ENABLE_LESION_OVERLAY` (web app) are set. It then adds a \"Possible lesions\" view to each eye in the app and a picture with counts per eye in the PDF. "
        "On held-out test photographs it marked something in 34% of eyes without retinopathy and in 98-100% of eyes with retinopathy; Dice against expert masks "
        "was 0.45 (microaneurysms), 0.42 (hemorrhages), 0.62 (hard exudates) and 0.51 (soft exudates) "
        "(validation/results/lesions_dl_Stage2_LesionUNet_v2_calibrated.md).\n")
    add("| Where | Text |\n|---|---|")
    for key, label in [("lesion_caption", "Heading above each eye's picture (PDF, after the eye name)"), ("lesion_note", "Note when something is marked (app and PDF)"),
                       ("lesion_none_note", "Note when nothing is marked (app and PDF)")]:
        add(f"| {label} | {ct.PDF_TEXT[key]} |")
    for key, label in ct.LESION_LABELS.items():
        add(f"| Count row: {key} | {label} |")
    add(f"| Evidence heading (app and PDF) | {ct.LESION_EVIDENCE_TEXT['title']} |")
    for key, label in [("only_ma", "When only possible microaneurysms are marked"), ("hemorrhages", "When possible hemorrhages are marked ({quadrants}, {with20} filled in)"),
                       ("exudates_near_fovea", "When possible hard exudates are near the estimated fovea"), ("not_assessed", "Always, under the evidence")]:
        add(f"| {label} | {ct.LESION_EVIDENCE_TEXT[key]} |")
    add("\nThe quadrants are centred on the fovea, which is estimated from the optic disc found by the lesion network (about 2.5 disc diameters "
        "temporal to it); accuracy on IDRiD's labelled centres is in `validation/results/localisation.md`. Hemorrhage counts are connected regions, "
        "so touching hemorrhages count once.")
    add("\n- **Question for the reviewer:** is it acceptable to show possible lesions that also appear on about 1 in 3 eyes without retinopathy, "
        "and should the overlay be shown for eyes the referral model did not flag?\n")

    add("### 3f. Developer tool: the MATLAB PDF (Stage 4)\n")
    add("`createMedicalReport.m` / `run_stage4.m` are the team's original command-line report generator for a single photograph. The app does **not** use it. Its wording is below "
        "because the file can still be run by hand.\n")
    add("Source: `stage4_explainability/report/formatReportText.m` (captured by running the real function). "
        + ("**The capture is out of date: re-run `python docs/tools/export_stage4_text.py`.**\n" if s4["source_sha256"] != stage4_source_hash() else "\n"))
    for case in s4["cases"]:
        t = case["text"]
        add(f"**{case['case']}**\n")
        add(quote(f"{t['icdrLevel']}\n{t['confidenceNote']}\n{t['referralLine']}") + "\n")
    add("**Disclaimer on every PDF report:**\n")
    add(quote(s4["cases"][0]["text"]["disclaimer"]) + "\n")
    add("The PDF header reads \"AI SCREENING AID\", the badge reads \"REFERRAL RECOMMENDED\" (red) or \"NO REFERRAL FLAGGED\" (a neutral slate colour, deliberately not green), "
        "and the metadata cells are labelled PREDICTED GRADE (ESTIMATE), CONFIDENCE (a band), REFERRAL SCORE and DATE. The left picture is titled \"FUNDUS IMAGE (AS ANALYSED)\" "
        "(the cropped view the network sees) and the right one \"REGIONS THAT RAISED THE REFERRAL SCORE\".\n")
    t0 = s4["cases"][0]["text"]
    if t0.get("heatmapNote"):
        add(f"- **Caption under the heatmap:** \"{t0['heatmapNote']}\"")
        add(f"- **Caption under the class-probability chart** (titled \"CLASS PROBABILITIES (RAW OUTPUT)\"): \"{t0['probabilityNote']}\"")
        add(f"- **Shown instead when no region raised the score (web app):** \"{web['HEATMAP_EMPTY_NOTE']}\"\n")

    gc_path = RESULTS / "gradcam.json"
    if gc_path.exists():
        g = json.loads(gc_path.read_text(encoding="utf-8"))
        loc, old, dele = g["localisation_referral_map"], g["localisation_earlier_map"], g["deletion_largest"]
        mm = g["old_map_mismatch"]
        add("**How far the heatmap can be trusted** (details and method: `validation/results/gradcam.md`). The map shows the regions that raised the *referral score* "
            "(the quantity the decision is made on). Before this change it explained the single most likely grade instead, which for "
            f"{mm['mismatched']} of {mm['flagged']} referral-flagged test eyes was No DR or Mild.\n")
        add(f"- It depends on what the network learned: with random weights it correlates only {g['randomised_all_layers_abs_corr']:.2f}-{g['randomised_classifier_abs_corr']:.2f} with the real map.")
        add(f"- The hottest regions matter more than others, but the effect is modest: hiding the {dele['cells']} hottest of about {dele['cells_inside_retina']} cells lowers the referral score by {dele['hottest_drop']:.3f} on average "
            f"({dele['hottest_minus_random']:+.3f} more than hiding {dele['cells']} random cells; hottest more important in {dele['share_of_eyes_hottest_larger'] * 100:.0f}% of eyes). "
            "A flagged eye stays flagged: the evidence is spread across the retina.")
        add(f"- It is only weakly hotter on lesions than elsewhere: on IDRiD photographs with expert lesion masks the pixel AUC is {loc['pixel_auc']:.2f} (0.5 is chance) and the hottest point is on a lesion in "
            f"{loc['hottest_pixel_on_lesion'] * 100:.0f}% of photographs (chance {loc['chance'] * 100:.1f}%); the earlier map scored AUC {old['pixel_auc']:.2f}.")
        add("- **Question for the reviewer:** is a coarse \"regions that raised the score\" picture appropriate to show to patients, or only to clinicians?\n")

    add("### 3g. Not covered by this packet\n")
    add("- **Hindi and Kannada.** The dashboard summary is machine-translated (Argos Translate, which has **no Kannada model**, so Kannada stays English) on demand; it has not been reviewed by a "
        "clinician or a medical translator. The fixed interface labels in `frontend/src/locales/` are also unreviewed. Machine translation of medical advice can be "
        "wrong; consider disabling it, or having translations professionally reviewed, before use with patients.")
    add("- **Anything typed by staff or patients**, and SMS text (sign-in codes only).\n")

    add("## 4. Wording principles applied, and what changed\n")
    add("These are engineering safeguards, not clinical judgements; please confirm or overrule each one.\n")
    add("1. **Never reassure.** Any \"nothing found\" message says it does not rule out disease.\n"
        "2. **Recommend, do not instruct** (\"is recommended\", never \"is required\").\n"
        "3. **No clinical timings** (screening intervals) that nobody qualified has approved; defer to the patient's eye-care professional.\n"
        "4. **Attribute to the model** (\"the screening model detected signs consistent with...\"); never \"you have\".\n"
        "5. **Say the stage is an estimate** where it matters, and give confidence as a band.\n")
    add("| Earlier wording | Now | Why |\n|---|---|---|")
    for old, new, why in [
        ("\"Stage 0 - Clear\" / \"Clear\"", "\"Stage 0 - No DR detected\"", "\"Clear\" reads as healthy; the tool misses about 8% of referable cases."),
        ("\"Continue routine annual screening.\"", "\"...does not rule out disease... as advised by your eye-care professional\"", "Removes an unapproved interval and a reassurance."),
        ("\"repeat screening in 6-12 months\"", "\"ask them how often you should be screened\"", "Removes an unapproved interval."),
        ("\"Routine screening interval; no urgent referral indicated\" (PDF)", "\"NO REFERRAL FLAGGED... does not rule out disease\"", "Removes a reassurance the evidence does not support."),
        ("\"Human Doctor Review Required\" / \"Immediate ... review is required\"", "\"Specialist Review Recommended\" / \"Prompt referral ... is recommended\"", "Recommend rather than instruct; the tool cannot know urgency."),
        ("\"RULE_3_PATHOLOGY_THRESHOLD\", \"Safety Engine\" style codes", "\"Basis: referral score compared with a 20% threshold\"", "The codes implied a formal clinical rules engine that does not exist."),
        ("\"DIAGNOSTIC REPORT\", \"Clinical Evidence & Decision Rationale\"", "\"SCREENING REPORT\", \"How this result was reached\"", "This is a screening aid, not diagnostic evidence."),
        ("\"model confidence 91%\"", "\"High confidence\"", "Raw probabilities are over-confident (see section 2)."),
        ("Referable \"probability\"", "\"referral score\"", "The raw output is not a calibrated probability."),
        ("\"diagnostic biomarker analytics\" (sign-in page)", "\"AI-assisted retinal screening...\"", "Overclaimed."),
        ("Disclaimer: \"not a medical diagnosis\"", "adds \"can miss disease... has not been clinically validated\"", "States the two most important limits."),
    ]:
        add(f"| {old} | {new} | {why} |")
    add("")

    add("## 5. Questions for the reviewer\n")
    for i, q in enumerate([
        "Is \"referable = moderate NPDR or worse\" the right referral criterion for your setting and guidelines? (Macular oedema is not assessed.)",
        f"Is the operating point acceptable? At the {thr:.1%} threshold about {pct(1 - rate['sensitivity'], 0)} of referable patients are missed in testing, including {misses['Proliferate_DR'][1]} of {misses['Proliferate_DR'][0]} proliferative cases. What miss rate is acceptable, and should the threshold be lower (more sensitive, more false alarms)?",
        "Is the \"does not rule out disease\" wording, and the safety-net sentence about changes in vision, appropriate for a no-referral result? Is anything else needed (for example emergency symptoms)?",
        "For a Mild result below the referral threshold, is \"follow-up with an eye-care professional is recommended\" right, and is there a local guideline interval that should be stated?",
        "For Severe and Proliferative results, is \"URGENT ... prompt referral to an ophthalmologist is recommended\" the right urgency and phrasing?",
        "Is the escalation policy sensible: showing Stage 2 when the threshold flags an eye whose most likely stage is Mild or None, with an explanation? Or would you rather present only the referral decision?",
        f"Should per-eye stage labels be shown at all, given the exact stage is right only {pct(perf['accuracy_5class'], 0)} of the time? (Or shown only to clinicians?)",
        "Terminology: \"Stage 0-4\" versus the ICDR severity scale wording (the PDF uses ICDR names such as \"No apparent retinopathy\"). Should these be aligned, and which audience (patient or clinician) is each message for?",
        "Are \"signs consistent with\" and \"detected\" the right level of hedging?",
        "Image-quality messages: is asking the user to retake a blurry photo sufficient, and should poor-lighting images be blocked rather than enhanced?",
        "Translations: is machine translation of these summaries acceptable at all, or should it be switched off until professionally reviewed?",
        "Who is responsible for follow-up when a patient is flagged, and does the wording make that clear enough?",
        "The tool over-refers on a second dataset (many healthy eyes flagged). Should each site be required to grade a local sample and re-tune the referral threshold "
        "before use, and how many images and which agreement with clinicians would you accept as evidence it is safe to deploy there?",
    ], 1):
        add(f"{i}. {q}")
    add("")
    add("## 6. Outside a wording review\n")
    add("Wording cannot fix these; see `validation/REPORT.md` and `deploy/DEPLOYMENT.md`: no clinical validation on your own cameras and patients, "
        "regulatory status of software that grades disease from images, consent and privacy law, and the clinical pathway for flagged patients.\n")
    return "\n".join(L)


def main():
    text = build()
    if "--check" in sys.argv:
        current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
        if current.replace("\r\n", "\n") != text.replace("\r\n", "\n"):
            print("docs/CLINICAL_REVIEW.md is out of date: run python docs/tools/build_clinical_review.py", file=sys.stderr)
            sys.exit(1)
        print("docs/CLINICAL_REVIEW.md is up to date")
        return
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT} ({text.count(chr(10))} lines)")


if __name__ == "__main__":
    main()
