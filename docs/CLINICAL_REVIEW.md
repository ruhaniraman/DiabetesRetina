# Clinical review packet

> **Status: NOT reviewed by a clinician.** This file exists so that a qualified reviewer can check everything the tool tells patients and staff in one sitting. It is generated from the code and the validation data (`python docs/tools/build_clinical_review.py`); do not edit it by hand. Until it is signed off, treat every message below as unreviewed draft text.

## Sign-off

| Reviewer (name, qualification) | Date | Scope reviewed | Outcome (approved / approved with changes / not approved) | Signature |
|---|---|---|---|---|
| | | | | |
| | | | | |

## 1. What the tool is, and what it decides

A screening aid for diabetic retinopathy (DR). For each eye it takes one fundus photograph and produces (a) an estimated **stage** (0 No DR, 1 Mild, 2 Moderate, 3 Severe, 4 Proliferative) and (b) a **referral score**: the model's summed probability of Moderate, Severe and Proliferative. An eye is **flagged for referral** when that score is at least **20%** (the model's tuned "high sensitivity" operating point). "Referable" therefore means moderate non-proliferative DR or worse; **macular oedema and other eye disease are not assessed.**

The patient-level result is the worse of the two eyes. If the threshold flags an eye whose most likely stage is milder than Stage 2, the overall result is **raised to Stage 2 and explained in the text** (an "escalation"), so a referable result can never appear routine.

## 2. How well it works (held-out APTOS test images; not clinical validation)

Full detail: `validation/REPORT.md`. Test set: 548 images never used in training (223 referable).

| Measure | Result |
|---|---|
| Referable patients found (sensitivity) | **95.1%** (95% CI 91.4% to 97.2%) |
| Non-referable correctly not flagged (specificity) | **89.2%** (85.4% to 92.2%) |
| Excluding test images duplicated in training | sensitivity 94.3%, specificity 88.9% |
| Exact stage correct (5 classes) | 78.1% |
| **Second dataset (IDRiD, 516 full-resolution photographs, never seen in training):** sensitivity | 94.4% |
| **Second dataset (IDRiD):** specificity | **46.1%**: it flagged more than half of the healthy eyes |
| Referable patients found if decided from the single most likely stage instead | 82.1% (this is why the threshold rule is used) |

**Where it fails (test set):**

- Missed referable cases at the deployed threshold: 11 of 223 (Moderate 15 of 150, Severe 0 of 29, Proliferative 2 of 44).
- A **proliferative** case (`eaa0dfbd5024`) was called Mild with referral score 0.04: the tool said nothing was flagged.
- The exact stage is unreliable at the severe end: only 52% of Severe and 48% of Proliferative cases were graded as such (most were graded a neighbouring or two-away stage).
- **It does not transfer cleanly to other data.** On the second public dataset it found 94.4% of referable patients but only 46.1% of healthy eyes were left unflagged, so a clinic using a different camera or population could see many false referrals. Nothing is known about other cameras, age groups or diabetes types. The reference grades themselves are imperfect (the same photograph appears with different grades).

**What a flag means in a real clinic** (positive predictive value falls as disease becomes rarer):

| Referable prevalence | Chance a flag is truly referable | Chance a "no referral" is truly fine | Flagged per 1,000 patients |
|---|---|---|---|
| 20% | 68% | 98.4% | 278 |
| 10% | 49% | 99.3% | 194 |
| 5% | 31% | 99.7% | 153 |

**Confidence bands.** The interface shows High / Moderate / Low, not a percentage, because the model's raw probabilities are over-confident. Measured on the test set:

| Band (raw top probability) | Images | Model claims | Exact stage actually right | Referral decision wrong |
|---|---|---|---|---|
| High | 293 | 98% | 94% | 1.7% |
| Moderate | 100 | 81% | 68% | 17.0% |
| Low | 155 | 54% | 54% | 18.1% |

The referral decision was wrong in 1.7% of High-confidence results and 17.6% of the rest.

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

> The most likely grade was mild retinopathy (Stage 1), but the screening model's referral threshold (20%) was reached in the left eye (referral score 35%). This is treated as referable (Stage 2 or worse) until a clinician reviews it. The exact stage is an estimate; the referral decision is the more reliable result.

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
- **Note about stage reliability:** "The referral decision is the more reliable output. On held-out test images it found about 92% of referable cases, while the exact stage matched the reference grade about 78% of the time. Results depend on the camera and population: on a second public dataset it flagged many more eyes that had no disease (see validation/REPORT.md)."
- **Note when a heatmap is shown:** "Shows where the model looked, not a lesion detection. Warm colours do not by themselves mean disease."
- **Shown when text is machine-translated:** "Machine-translated and not clinically reviewed. If anything is unclear, the English text is authoritative."
- **Chip on an eye flagged despite a milder stage:** "Referral flagged" (hover: "The most likely stage is lower, but the screening model's referral threshold was reached")
- **Confidence note (report):** "Lower confidence means the grade is less likely to be right. In testing, the referral decision was wrong in about 1% of high-confidence results and about 15% of the rest."
- **Sign-in page:** "AI-assisted retinal screening to help catch diabetic eye disease early."

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
| Slightly soft | warn | Image is slightly soft; results may be less reliable. |
| Dark | warn | Image is dark; results may be less reliable. |
| Very bright | warn | Image is very bright; results may be less reliable. |
| Passes | accept | Quality check passed. |

### 3d. PDF screening report (Stage 4)

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

The PDF header reads "AI SCREENING AID", the badge reads "REFERRAL RECOMMENDED" or "NO REFERRAL FLAGGED", and the metadata cells are labelled PREDICTED GRADE (ESTIMATE), CONFIDENCE (a band), REFERRAL SCORE and DATE.

### 3e. Not covered by this packet

- **Hindi and Kannada.** The dashboard summary is machine-translated (Argos Translate) on demand and labelled as such; it has not been reviewed by a clinician or a medical translator. The fixed interface labels in `frontend/src/locales/` are also unreviewed. Machine translation of medical advice can be wrong; consider disabling it, or having translations professionally reviewed, before use with patients.
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
2. Is the operating point acceptable? At the 20% threshold about 5% of referable patients are missed in testing, including 2 of 44 proliferative cases. What miss rate is acceptable, and should the threshold be lower (more sensitive, more false alarms)?
3. Is the "does not rule out disease" wording, and the safety-net sentence about changes in vision, appropriate for a no-referral result? Is anything else needed (for example emergency symptoms)?
4. For a Mild result below the referral threshold, is "follow-up with an eye-care professional is recommended" right, and is there a local guideline interval that should be stated?
5. For Severe and Proliferative results, is "URGENT ... prompt referral to an ophthalmologist is recommended" the right urgency and phrasing?
6. Is the escalation policy sensible: showing Stage 2 when the threshold flags an eye whose most likely stage is Mild or None, with an explanation? Or would you rather present only the referral decision?
7. Should per-eye stage labels be shown at all, given the exact stage is right only 78% of the time? (Or shown only to clinicians?)
8. Terminology: "Stage 0-4" versus the ICDR severity scale wording (the PDF uses ICDR names such as "No apparent retinopathy"). Should these be aligned, and which audience (patient or clinician) is each message for?
9. Are "signs consistent with" and "detected" the right level of hedging?
10. Image-quality messages: is asking the user to retake a blurry photo sufficient, and should poor-lighting images be blocked rather than enhanced?
11. Translations: is machine translation of these summaries acceptable at all, or should it be switched off until professionally reviewed?
12. Who is responsible for follow-up when a patient is flagged, and does the wording make that clear enough?
13. The tool over-refers on a second dataset (many healthy eyes flagged). Should each site be required to grade a local sample and re-tune the referral threshold before use, and how many images and which agreement with clinicians would you accept as evidence it is safe to deploy there?

## 6. Outside a wording review

Wording cannot fix these; see `validation/REPORT.md` and `deploy/DEPLOYMENT.md`: no clinical validation on your own cameras and patients, regulatory status of software that grades disease from images, consent and privacy law, and the clinical pathway for flagged patients.
