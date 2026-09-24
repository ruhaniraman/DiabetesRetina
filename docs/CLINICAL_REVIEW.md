# Clinical review packet

> **Status: NOT reviewed by a clinician.** This file exists so that a qualified reviewer can check everything the tool tells patients and staff in one sitting. It is generated from the code and the validation data (`python docs/tools/build_clinical_review.py`); do not edit it by hand. Until it is signed off, treat every message below as unreviewed draft text.

## Sign-off

| Reviewer (name, qualification) | Date | Scope reviewed | Outcome (approved / approved with changes / not approved) | Signature |
|---|---|---|---|---|
| | | | | |
| | | | | |

## 1. What the tool is, and what it decides

A screening aid for diabetic retinopathy (DR). For each eye it takes one fundus photograph and produces (a) an estimated **stage** (0 No DR, 1 Mild, 2 Moderate, 3 Severe, 4 Proliferative) and (b) a **referral score**: the model's summed probability of Moderate, Severe and Proliferative. An eye is **flagged for referral** when that score is at least **9.6%** (chosen on validation images for 99% sensitivity). "Referable" therefore means moderate non-proliferative DR or worse; **macular oedema and other eye disease are not assessed.**

The patient-level result is the worse of the two eyes. If the threshold flags an eye whose most likely stage is milder than Stage 2, the overall result is **raised to Stage 2 and explained in the text** (an "escalation"), so a referable result can never appear routine.

## 2. How well it works (held-out APTOS test images; not clinical validation)

Full detail: `validation/REPORT.md`. Test set: 548 images never used in training (223 referable).

| Measure | Result |
|---|---|
| Referable patients found (sensitivity) | **96.9%** (95% CI 93.7% to 98.5%) |
| Non-referable correctly not flagged (specificity) | **88.3%** (84.4% to 91.4%) |
| Excluding test images duplicated in training | sensitivity 96.4%, specificity 87.8% |
| Exact stage correct (5 classes) | 79.4% |
| **Second dataset (IDRiD official test set, 103 photographs; the model trained on IDRiD's other photographs):** sensitivity | 90.6% |
| **Second dataset (IDRiD):** specificity | **53.8%**: it flagged 46% of the eyes without referable disease |
| Referable patients found if decided from the single most likely stage instead | 89.2% (this is why the threshold rule is used) |

**Where it fails (test set):**

- Missed referable cases at the deployed threshold: 7 of 223 (Moderate 6 of 150, Severe 0 of 29, Proliferative 1 of 44).
- A **proliferative** case (`eaa0dfbd5024`) was called Mild with referral score 0.03: the tool said nothing was flagged.
- The exact stage is unreliable at the severe end: only 62% of Severe and 57% of Proliferative cases were graded as such (most were graded a neighbouring or two-away stage).
- **It does not transfer cleanly to other data.** On the second public dataset it found 90.6% of referable patients but only 53.8% of healthy eyes were left unflagged, so a clinic using a different camera or population could see many false referrals. Nothing is known about other cameras, age groups or diabetes types. The reference grades themselves are imperfect (the same photograph appears with different grades).

**What a flag means in a real clinic** (positive predictive value falls as disease becomes rarer):

| Referable prevalence | Chance a flag is truly referable | Chance a "no referral" is truly fine | Flagged per 1,000 patients |
|---|---|---|---|
| 20% | 66% | 99.0% | 290 |
| 10% | 47% | 99.5% | 206 |
| 5% | 29% | 99.8% | 164 |

**Confidence bands.** The interface shows High / Moderate / Low, not a percentage. The band comes from temperature-scaled probabilities (the raw network is over-confident; the temperature was fitted on validation images, see `validation/results/calibration.md`). Measured on the test set:

| Band (calibrated top probability) | Images | Model claims | Exact stage actually right | Referral decision wrong |
|---|---|---|---|---|
| High | 270 | 99% | 98% | 0.7% |
| Moderate | 96 | 80% | 71% | 19.8% |
| Low | 182 | 55% | 56% | 13.2% |

The referral decision was wrong in 0.7% of High-confidence results and 15.5% of the rest.

## 3. Everything the tool says

### 3a. Result summary (shown on the dashboard, saved to the patient's history, and returned by the API)

Source: `backend/clinical_text.py`. Every summary ends with the standard disclaimer (quoted once at the end of this section).

**Nothing detected in either eye**

> The screening model did not detect diabetic retinopathy in either eye. This does not rule out disease, because the screening tool can miss it. Continue regular eye screening as advised by your eye-care professional, and seek review sooner if you notice any change in your vision.

**Mild in one eye (below the referral threshold)**

> The screening model detected signs consistent with mild non-proliferative diabetic retinopathy (Stage 1) in the left eye. Follow-up with an eye-care professional is recommended; ask them how often you should be screened.

**Moderate in the left eye**

> The screening model detected signs consistent with moderate non-proliferative diabetic retinopathy (Stage 2) in the left eye. Referral to an eye specialist is recommended.

**Severe in the right eye**

> URGENT: the screening model detected signs consistent with severe non-proliferative diabetic retinopathy (Stage 3) in the right eye. Prompt referral to an ophthalmologist is recommended.

**Proliferative in both eyes**

> URGENT: the screening model detected signs consistent with proliferative diabetic retinopathy (Stage 4) in the left and right eyes. Prompt referral to an ophthalmologist is recommended.

**Escalation: most likely stage is Mild, but the referral threshold is reached in the left eye**

> The most likely grade was mild retinopathy (Stage 1), but the screening model's referral threshold (10%) was reached in the left eye (referral score 35%). This is treated as referable (Stage 2 or worse) until a clinician reviews it. The exact stage is an estimate; the referral decision is the more reliable result.

**Standard disclaimer appended to every summary:**

> This is an automated screening aid, not a diagnosis, and it can miss disease: symptoms or a clinician's concern should always prompt review.

**Per-eye stage labels:** `No_DR` → "Stage 0 - No DR detected"; `Mild` → "Stage 1 - Mild"; `Moderate` → "Stage 2 - Moderate"; `Severe` → "Stage 3 - Severe"; `Proliferate_DR` → "Stage 4 - Proliferative".

### 3b. Web app screens

Source: `frontend/src/clinicalText.js`.

**Overall banner** (badge / title):

| Result | Badge | Title |
|---|---|---|
| No_DR | Stage 0 · No DR detected | Overall Assessment: Stage 0 – No DR detected |
| Mild | Stage 1 Risk | Overall Assessment: Stage 1 – Mild |
| Moderate | Stage 2 Risk | Overall Assessment: Stage 2 – Moderate |
| Severe | Stage 3 Risk | Overall Assessment: Stage 3 – Severe |
| Proliferate_DR | Stage 4 Risk | Overall Assessment: Stage 4 – Proliferative |
| Pending | Pending | Overall Assessment: Awaiting Scan Data |

**Report page outcome** (what the reader is told to do):

| Outcome | Heading | Tag | Explanation |
|---|---|---|---|
| none | No Assessment Yet | Not assessed | Upload both fundus images on the dashboard and run the AI assessment. Nothing on this page should be read as a result until then. |
| noReferral | No Referral Flagged | No referral flagged | The screening model did not flag diabetic retinopathy in either eye. This does not rule out disease: the tool can miss it. Continue regular eye screening as advised by your eye-care professional. |
| followUp | Follow-up Recommended | Follow-up recommended | The screening model detected mild changes. Follow-up with an eye-care professional is recommended; ask them how often you should be screened. |
| referral | Specialist Review Recommended | Referral flagged | The screening model flagged possible diabetic retinopathy in at least one eye. Review by an eye-care professional is recommended; this result cannot be acted on automatically. |

Basis line: "Basis: referral score compared with a 20% threshold".

**Other wording:**

- **Before an assessment is run:** "Upload fundus images for both eyes and run the AI assessment to see the screening result."
- **On-screen disclaimer:** "Screening aid only. Results are produced by automated image analysis and are not a medical diagnosis, and the tool can miss disease. It has not been clinically validated. Always have a qualified eye-care professional review the findings before making any treatment decision."
- **Note about stage reliability:** "The referral decision is the more reliable output. On held-out test images it found about 97% of referable cases, while the exact stage matched the reference grade about 79% of the time. Results depend on the camera and population: on a second public dataset it flagged many more eyes that had no disease (see validation/REPORT.md)."
- **Note when a heatmap is shown:** "Shows the regions that raised this eye's referral score, on a coarse grid. A rough guide, not a lesion detection: warm colours do not by themselves mean disease, and disease can be present outside them."
- **Note under the heatmap of an eye that was not flagged:** "This eye's referral score is below the threshold, so it was not flagged. The map shows where the score was relatively highest, not a finding."
- **Shown when text is machine-translated:** "Machine-translated and not clinically reviewed. If anything is unclear, the English text is authoritative."
- **Chip on an eye flagged despite a milder stage:** "Referral flagged" (hover: "The most likely stage is lower, but the screening model's referral threshold was reached")
- **Confidence note (report):** "Lower confidence means the grade is less likely to be right. In testing, the referral decision was wrong in about 1% of high-confidence results and about 15% of the rest."
- **Sign-in page:** "AI-assisted retinal screening to help catch diabetic eye disease early."

### 3b-1. Listen (the result read aloud)

Source: `frontend/src/speech/reportScript.js`, fixed lines in `frontend/src/clinicalText.js` (`SPEECH`). A "Listen to the result" button on the dashboard and the report page reads the result aloud for people who cannot read it. **Nothing plays until the person taps.** The script is, in order: the introduction, the summary sentence(s) shown in 3a, one line per eye (the stage label, then "Referral flagged." or "No referral flagged.") and any photograph-quality warning. Percentages and scores are not read out. The voice is one built into the phone or browser: only voices that run on the device are used (online voices, which send the text to a service, are refused so the result stays private). In Hindi and Kannada the button reads **fixed sentences** (`frontend/src/speech/translations.json`), chosen by which result the server produced, and never machine translation (the machine translator has no Kannada model, and its Hindi mistranslated safety-critical sentences). Those sentences are drafts, so **speech in Hindi and Kannada is switched off until a qualified person has reviewed them**; the sheet for that person is `docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md`. The words being read are always shown on the page, with the current sentence highlighted.

- **Introduction:** "This is your diabetic retinopathy screening result."
- **Before the left eye line:** "Left eye"
- **Before the right eye line:** "Right eye"
- **When an eye is flagged:** "Referral recommended."
- **When an eye is not flagged:** "No referral flagged."
- **Before each photograph-quality warning:** "About the photographs:"
- **Question for the reviewer:** are the fixed Hindi and Kannada sentences (`docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md`) correct and clear enough to be read aloud to someone who cannot read them to check? Would recordings by a person be safer than a phone's synthetic voice?

### 3c. Image-quality messages (shown when a photo is checked)

Source: `backend/quality.py`. A photo is **rejected** (the user is asked to retake it) or **accepted with a warning**. The image is never altered: nothing is "enhanced". Thresholds and their evidence: `validation/QUALITY.md`.

| Situation | Outcome | Message |
|---|---|---|
| No retina found | reject | No retina could be found in this image. Please upload a fundus photograph. |
| Very blurry | reject | Image rejected: too blurry for a reliable assessment. Please retake the photo. |
| Very dark | reject | Image rejected: too dark for a reliable assessment. Please retake the photo with better illumination. |
| Overexposed | reject | Image rejected: overexposed. Please retake the photo. |
| Grainy or heavily compressed | reject | Image rejected: it looks grainy or heavily compressed. Please retake the photo or upload the original file. |
| Not a colour retinal photograph (greyscale, or no retinal colour) | reject | Image rejected: this does not look like a colour retinal photograph. Please upload a colour fundus photograph. |
| Only part of the retina in the picture | reject | Image rejected: only part of the retina is visible. Please retake the photo with the whole retina in the frame. |
| The same photo uploaded for both eyes (checked when grading) | reject | Image rejected: the left and right photos are the same picture. Please upload a separate photo for each eye. |
| Unusual colour balance | warn | Image has an unusual colour balance for a retinal photograph; results may be less reliable. Check that it is a fundus photograph. |
| Optic disc not clearly visible | warn | Image may not show the optic disc clearly. Make sure the photograph is centred on the optic disc and macula; results may be less reliable. |
| Slightly soft | warn | Image is slightly soft; results may be less reliable. |
| Dark | warn | Image is dark; results may be less reliable. |
| Very bright | warn | Image is very bright; results may be less reliable. |
| Passes | accept | Quality check passed. |

### 3d. Downloadable PDF report (what a patient or clinician can save and print)

Source: `backend/report_pdf.py`, wording in `backend/clinical_text.py` (`PDF_TEXT`) plus the summary sentence shown in 3a. Created when the user presses "Download PDF Report": the server grades both photographs again, draws the heatmaps and returns the PDF. **It prints the patient's name and date of birth (if given) and both eyes' results.** The server keeps neither the photographs nor the report file and adds nothing to the exam history. Names in scripts the report font cannot print (for example Devanagari or Kannada) are replaced by a note. The report never shows raw class probabilities. Lesions appear only when the Stage 2 lesion overlay is turned on (section 3e), and then only as possible lesions with a caveat.

| Where | Text |
|---|---|
| Header | RETINARESCUE  •  AI SCREENING AID |
| Title | Diabetic Retinopathy Screening Report |
| Badge, referral flagged (red) | REFERRAL RECOMMENDED |
| Badge, no referral flagged (neutral slate, not green) | NO REFERRAL FLAGGED |
| Caption under the analysed photograph | Photograph as analysed by the model (cropped to the retina) |
| Caption under the heatmap | Regions that raised this eye's referral score |
| Note under each eye | Shows the regions that raised this eye's referral score, on a coarse grid. A rough guide, not a lesion detection: warm colours do not by themselves mean disease, and disease can be present outside them. |
| Note when no region is highlighted | No region raised this eye's referral score, so nothing is highlighted. That does not rule out disease. |
| Note under an eye that was not flagged | This eye's referral score is below the threshold, so it was not flagged. The map shows where the score was relatively highest, not a finding. |
| Eye flagged although its most likely stage is milder | Referral flagged although the most likely stage is lower |
| Note on confidence | Lower confidence means the grade is less likely to be right. In testing, the referral decision was wrong in about 1% of high-confidence results and about 15% of the rest. |
| Note on stage reliability | The referral decision is the more reliable output. On held-out test images it found about 97% of referable cases, while the exact stage matched the reference grade about 79% of the time. Results depend on the camera and population: on a second public dataset it flagged many more eyes that had no disease (see validation/REPORT.md). |
| Note when the site set its own threshold | The referral threshold used here was set by this site from its own calibration, not the model's default. It is only appropriate if the site's clinical lead has approved it. |
| Last line of the notes | Generated on request from the photographs supplied. The server does not keep this report file. |
| Instead of a name the font cannot print | (name uses characters this report cannot print; see the application record) |
| When name or date of birth is missing | Not provided |

Per eye the report lists: estimated stage (labelled an estimate), confidence band, referral score with the threshold, and the result for that eye. Any photograph-quality warnings are listed under "Notes on this report". The footer on every page reads "Automated screening aid, not a diagnosis".

- **Question for the reviewer:** should the PDF carry the patient's name and date of birth at all, and is the referral score percentage appropriate to print for patients?

### 3e. Stage 2 lesion overlay (off until this section is reviewed)

Source: wording in `backend/clinical_text.py` (`PDF_TEXT`, `LESION_LABELS`) and `frontend/src/clinicalText.js`; the overlay comes from `stage2_structure/dl/lesionOverlayToFile.m` (the calibrated v2 lesion network). It is shown only when `ENABLE_LESION_OVERLAY` (backend) and `VITE_ENABLE_LESION_OVERLAY` (web app) are set. It then adds a "Possible lesions" view to each eye in the app and a picture with counts per eye in the PDF. On held-out test photographs it marked something in 34% of eyes without retinopathy and in 98-100% of eyes with retinopathy; Dice against expert masks was 0.45 (microaneurysms), 0.42 (hemorrhages), 0.62 (hard exudates) and 0.51 (soft exudates) (validation/results/lesions_dl_Stage2_LesionUNet_v2_calibrated.md).

| Where | Text |
|---|---|
| Heading above each eye's picture (PDF, after the eye name) | Possible lesions marked by the lesion model |
| Note when something is marked (app and PDF) | Coloured areas are possible lesions for a clinician to check, not findings. In testing, the lesion model marked something in about 1 in 3 eyes that had no retinopathy, and it misses some lesions. |
| Note when nothing is marked (app and PDF) | The lesion model marked nothing in this photograph. That does not rule out disease. |
| Count row: microaneurysms | Possible microaneurysms |
| Count row: hemorrhages | Possible hemorrhages |
| Count row: exudates | Possible hard exudates |
| Count row: softExudates | Possible soft exudates |
| Evidence heading (app and PDF) | What the lesion marks show against the ICDR criteria (for the reviewer) |
| When only possible microaneurysms are marked | Only possible microaneurysms were marked. On the ICDR scale, microaneurysms alone correspond to mild non-proliferative DR. |
| When possible hemorrhages are marked ({quadrants}, {with20} filled in) | Possible hemorrhages were marked in {quadrants} of 4 quadrants, with 20 or more in {with20} of them. On the ICDR scale, 20 or more hemorrhages in each of the 4 quadrants is a sign of severe non-proliferative DR. |
| When possible hard exudates are near the estimated fovea | Possible hard exudates were marked near the estimated centre of the macula. Macular oedema is not assessed by this tool. |
| Always, under the evidence | Venous beading, IRMA and new vessels are not detected by the lesion model, so the marks alone cannot establish a grade. |

The quadrants are centred on the fovea, which is estimated from the optic disc found by the lesion network (about 2.5 disc diameters temporal to it); accuracy on IDRiD's labelled centres is in `validation/results/localisation.md`. Hemorrhage counts are connected regions, so touching hemorrhages count once.

- **Question for the reviewer:** is it acceptable to show possible lesions that also appear on about 1 in 3 eyes without retinopathy, and should the overlay be shown for eyes the referral model did not flag?

### 3f. Developer tool: the MATLAB PDF (Stage 4)

`createMedicalReport.m` / `run_stage4.m` are the team's original command-line report generator for a single photograph. The app does **not** use it. Its wording is below because the file can still be run by hand.

Source: `stage4_explainability/report/formatReportText.m` (captured by running the real function). 

**No DR, high confidence, not flagged**

> ICDR Grade 0 (No apparent retinopathy)
> Model confidence in the predicted grade: High. Confidence is only a rough guide: the model tends to be over-confident.
> NO REFERRAL FLAGGED by the screening model. This does not rule out disease, because the screening tool can miss it. Continue regular eye screening as advised by your eye-care professional, and seek review sooner if you notice any change in your vision. Referral score: 3.0% (flagged at 20% or more).

**Mild, high confidence, not flagged**

> ICDR Grade 1 (Mild nonproliferative DR)
> Model confidence in the predicted grade: High. Confidence is only a rough guide: the model tends to be over-confident.
> NO REFERRAL FLAGGED by the screening model. This does not rule out disease, because the screening tool can miss it. Mild changes were detected: follow-up with an eye-care professional is recommended; ask them how often you should be screened. Referral score: 6.0% (flagged at 20% or more).

**Mild grade but referral threshold reached (the escalation case)**

> ICDR Grade 1 (Mild nonproliferative DR)
> Model confidence in the predicted grade: Low. This case may sit near a grading boundary; clinical correlation is recommended regardless of the referral decision below. Confidence is only a rough guide: the model tends to be over-confident.
> RECOMMENDATION: Referral to an eye specialist for ophthalmological evaluation is recommended. Referral score: 35.0% (flagged at 20% or more).

**Moderate, high confidence, flagged**

> ICDR Grade 2 (Moderate nonproliferative DR)
> Model confidence in the predicted grade: High. Confidence is only a rough guide: the model tends to be over-confident.
> RECOMMENDATION: Referral to an eye specialist for ophthalmological evaluation is recommended. Referral score: 97.0% (flagged at 20% or more).

**Moderate, moderate confidence, flagged**

> ICDR Grade 2 (Moderate nonproliferative DR)
> Model confidence in the predicted grade: Moderate. The image may show features consistent with more than one grade. Confidence is only a rough guide: the model tends to be over-confident.
> RECOMMENDATION: Referral to an eye specialist for ophthalmological evaluation is recommended. Referral score: 90.0% (flagged at 20% or more).

**Moderate, low confidence, flagged**

> ICDR Grade 2 (Moderate nonproliferative DR)
> Model confidence in the predicted grade: Low. This case may sit near a grading boundary; clinical correlation is recommended regardless of the referral decision below. Confidence is only a rough guide: the model tends to be over-confident.
> RECOMMENDATION: Referral to an eye specialist for ophthalmological evaluation is recommended. Referral score: 66.0% (flagged at 20% or more).

**Severe, high confidence, flagged**

> ICDR Grade 3 (Severe nonproliferative DR)
> Model confidence in the predicted grade: High. Confidence is only a rough guide: the model tends to be over-confident.
> RECOMMENDATION: URGENT - prompt referral to an ophthalmologist is recommended. Referral score: 99.0% (flagged at 20% or more).

**Proliferative, moderate confidence, flagged**

> ICDR Grade 4 (Proliferative DR)
> Model confidence in the predicted grade: Moderate. The image may show features consistent with more than one grade. Confidence is only a rough guide: the model tends to be over-confident.
> RECOMMENDATION: URGENT - prompt referral to an ophthalmologist is recommended. Referral score: 93.0% (flagged at 20% or more).

**Proliferative missed by the model (Mild grade, low referral score)**

> ICDR Grade 1 (Mild nonproliferative DR)
> Model confidence in the predicted grade: Moderate. The image may show features consistent with more than one grade. Confidence is only a rough guide: the model tends to be over-confident.
> NO REFERRAL FLAGGED by the screening model. This does not rule out disease, because the screening tool can miss it. Mild changes were detected: follow-up with an eye-care professional is recommended; ask them how often you should be screened. Referral score: 2.0% (flagged at 20% or more).

**Disclaimer on every PDF report:**

> This output is generated by an automated screening aid and does not constitute a medical diagnosis. The tool can miss disease and has not been clinically validated. All findings should be confirmed by a qualified eye care professional before any clinical decision is made.

The PDF header reads "AI SCREENING AID", the badge reads "REFERRAL RECOMMENDED" (red) or "NO REFERRAL FLAGGED" (a neutral slate colour, deliberately not green), and the metadata cells are labelled PREDICTED GRADE (ESTIMATE), CONFIDENCE (a band), REFERRAL SCORE and DATE. The left picture is titled "FUNDUS IMAGE (AS ANALYSED)" (the cropped view the network sees) and the right one "REGIONS THAT RAISED THE REFERRAL SCORE".

- **Caption under the heatmap:** "Regions that raised this eye's referral score, on a coarse grid. A rough guide, not a lesion detection: warm colours do not by themselves mean disease, and disease can be present outside them."
- **Caption under the class-probability chart** (titled "CLASS PROBABILITIES (RAW OUTPUT)"): "Raw model output, which is over-confident. The referral score is what decides."
- **Shown instead when no region raised the score (web app):** "No region raised this eye's referral score, so nothing is highlighted. That does not rule out disease."

**How far the heatmap can be trusted** (details and method: `validation/results/gradcam.md`). The map shows the regions that raised the *referral score* (the quantity the decision is made on). Before this change it explained the single most likely grade instead, which for 42 of 254 referral-flagged test eyes was No DR or Mild.

- It depends on what the network learned: with random weights it correlates only 0.10-0.20 with the real map.
- The hottest regions matter more than others, but the effect is modest: hiding the 35 hottest of about 112 cells lowers the referral score by 0.172 on average (+0.221 more than hiding 35 random cells; hottest more important in 94% of eyes). A flagged eye stays flagged: the evidence is spread across the retina.
- It is only weakly hotter on lesions than elsewhere: on IDRiD photographs with expert lesion masks the pixel AUC is 0.70 (0.5 is chance) and the hottest point is on a lesion in 12% of photographs (chance 3.1%); the earlier map scored AUC 0.59.
- **Question for the reviewer:** is a coarse "regions that raised the score" picture appropriate to show to patients, or only to clinicians?

### 3g. Not covered by this packet

- **Hindi and Kannada.** The dashboard summary is machine-translated (Argos Translate, which has **no Kannada model**, so Kannada stays English) on demand; it has not been reviewed by a clinician or a medical translator. The fixed interface labels in `frontend/src/locales/` are also unreviewed. Machine translation of medical advice can be wrong; consider disabling it, or having translations professionally reviewed, before use with patients.
- **Anything typed by staff or patients**, and email text (sign-in codes only).

## 4. Wording principles applied, and what changed

These are engineering safeguards, not clinical judgements; please confirm or overrule each one.

1. **Never reassure.** Any "nothing found" message says it does not rule out disease.
2. **Recommend, do not instruct** ("is recommended", never "is required").
3. **No clinical timings** (screening intervals) that nobody qualified has approved; defer to the patient's eye-care professional.
4. **Attribute to the model** ("the screening model detected signs consistent with..."); never "you have".
5. **Say the stage is an estimate** where it matters, and give confidence as a band.

| Earlier wording | Now | Why |
|---|---|---|
| "Stage 0 - Clear" / "Clear" | "Stage 0 - No DR detected" | "Clear" reads as healthy; the tool misses about 8% of referable cases. |
| "Continue routine annual screening." | "...does not rule out disease... as advised by your eye-care professional" | Removes an unapproved interval and a reassurance. |
| "repeat screening in 6-12 months" | "ask them how often you should be screened" | Removes an unapproved interval. |
| "Routine screening interval; no urgent referral indicated" (PDF) | "NO REFERRAL FLAGGED... does not rule out disease" | Removes a reassurance the evidence does not support. |
| "Human Doctor Review Required" / "Immediate ... review is required" | "Specialist Review Recommended" / "Prompt referral ... is recommended" | Recommend rather than instruct; the tool cannot know urgency. |
| "RULE_3_PATHOLOGY_THRESHOLD", "Safety Engine" style codes | "Basis: referral score compared with a 20% threshold" | The codes implied a formal clinical rules engine that does not exist. |
| "DIAGNOSTIC REPORT", "Clinical Evidence & Decision Rationale" | "SCREENING REPORT", "How this result was reached" | This is a screening aid, not diagnostic evidence. |
| "model confidence 91%" | "High confidence" | Raw probabilities are over-confident (see section 2). |
| Referable "probability" | "referral score" | The raw output is not a calibrated probability. |
| "diagnostic biomarker analytics" (sign-in page) | "AI-assisted retinal screening..." | Overclaimed. |
| Disclaimer: "not a medical diagnosis" | adds "can miss disease... has not been clinically validated" | States the two most important limits. |

## 5. Questions for the reviewer

1. Is "referable = moderate NPDR or worse" the right referral criterion for your setting and guidelines? (Macular oedema is not assessed.)
2. Is the operating point acceptable? At the 9.6% threshold about 3% of referable patients are missed in testing, including 1 of 44 proliferative cases. What miss rate is acceptable, and should the threshold be lower (more sensitive, more false alarms)?
3. Is the "does not rule out disease" wording, and the safety-net sentence about changes in vision, appropriate for a no-referral result? Is anything else needed (for example emergency symptoms)?
4. For a Mild result below the referral threshold, is "follow-up with an eye-care professional is recommended" right, and is there a local guideline interval that should be stated?
5. For Severe and Proliferative results, is "URGENT ... prompt referral to an ophthalmologist is recommended" the right urgency and phrasing?
6. Is the escalation policy sensible: showing Stage 2 when the threshold flags an eye whose most likely stage is Mild or None, with an explanation? Or would you rather present only the referral decision?
7. Should per-eye stage labels be shown at all, given the exact stage is right only 79% of the time? (Or shown only to clinicians?)
8. Terminology: "Stage 0-4" versus the ICDR severity scale wording (the PDF uses ICDR names such as "No apparent retinopathy"). Should these be aligned, and which audience (patient or clinician) is each message for?
9. Are "signs consistent with" and "detected" the right level of hedging?
10. Image-quality messages: is asking the user to retake a blurry photo sufficient, and should poor-lighting images be blocked rather than enhanced?
11. Translations: is machine translation of these summaries acceptable at all, or should it be switched off until professionally reviewed?
12. Who is responsible for follow-up when a patient is flagged, and does the wording make that clear enough?
13. The tool over-refers on a second dataset (many healthy eyes flagged). Should each site be required to grade a local sample and re-tune the referral threshold before use, and how many images and which agreement with clinicians would you accept as evidence it is safe to deploy there?

## 6. Outside a wording review

Wording cannot fix these; see `validation/REPORT.md` and `deploy/DEPLOYMENT.md`: no clinical validation on your own cameras and patients, regulatory status of software that grades disease from images, consent and privacy law, and the clinical pathway for flagged patients.
