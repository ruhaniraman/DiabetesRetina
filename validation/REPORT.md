# Stage 3 model validation report

**Model:** `Stage3_Final_HighSensitivity_Model.mat` (class-weighted ResNet, deployed in the app).
**Data:** APTOS 2019, 3,662 fundus photographs, the split recorded by the model's own training run.
**Purpose:** find out how well the model really works on images it never trained on, and whether the app uses it the way it was validated.

> This is an internal technical validation on one public dataset. It is **not** clinical validation and does not show the
> tool is safe or effective for patients. See [What this does not establish](#what-this-does-not-establish).

## Bottom line

1. **On held-out images the model performs well as a referral screen.** Test set (548 images, never trained on):
   it flags **92.4%** of referable patients (95% CI 88.1-95.2%) and correctly clears **89.8%** of non-referable ones
   (86.1-92.7%); AUC **0.974**. "Referable" means moderate non-proliferative DR or worse.
2. **The exact stage is much less reliable than the referral decision.** The five-way grade is right 77.7% of the time,
   and only 41% of proliferative and 59% of severe cases are labelled as such. Of the 44 proliferative test cases, 18 were
   graded proliferative, 13 Moderate (two grades away), 7 Severe and 6 Mild. Use the referral flag, treat the stage as an
   estimate.
3. **The model misses some serious disease.** 2 of 44 proliferative and 15 of 150 moderate test cases were not flagged.
   Both proliferative misses were called *Mild* with low referral probability (0.15 and 0.02); neither is a duplicate
   image. No screening tool of this kind catches everything, and the app now says so.
4. **Two problems in the app were found and fixed** (below): it used the wrong preprocessing, and it ignored the model's
   tuned referral threshold, which would have missed about 1 in 12 referable patients that the model can find.
5. **The stored test numbers are slightly optimistic.** 13.7% of test images have a duplicate in the training or
   validation data. Excluding them, sensitivity is 91.2% and specificity 89.2%.

## Problems found in the app, and what was changed

| Finding | Evidence | Change |
|---|---|---|
| **Wrong preprocessing.** The app cropped each photo to the retina and padded it; the model was trained on plain resized images. | Plain resize reproduces the model's own stored test result **exactly** (TP 206 / TN 292 / FP 33 / FN 17) and the baseline network's saved predictions **548/548**. Cropping agrees only 92.3% of the time. | Stage 3 and the Stage 4 Grad-CAM now use one shared plain-resize function (`utils/preprocessStage3Input.m`), so the heatmap explains exactly the image that was graded. |
| **The tuned referral threshold was ignored.** The app decided from the single most-likely grade. | On the test set that rule finds 187 of 223 referable patients (**83.9%**); the model's threshold rule (referable probability >= 0.2) finds 206 (**92.4%**): **19 more patients caught**, 15 more false alarms. | The backend applies the threshold. An eye it flags is never shown as routine: the overall grade is raised to at least Stage 2 and the summary explains why. The dashboard shows a "Referral flagged" chip and the report shows each eye's referral probability. |

A real example from the test set: image `10ecc5292ab1` (true grade Moderate) was called *Mild* by the model, with a referral
probability of 49%. The old app showed it as Stage 1, routine; the app now shows it as referable.

## Method

- **Held-out data is provably held out.** `stage_3/Stage3_checkpoint.mat` stores the exact train (2,564) / validation (550) /
  test (548) split. The three sets do not overlap, cover all 3,662 images exactly once, match `train.csv` labels for every
  image, and the test set's class counts match the model's stored results (223 referable, 325 non-referable).
- **Predictions** come from the model itself on those images (`validation/predictSplit.m`), with the preprocessing the model
  was trained with. The app's live pipeline was checked against these predictions and agrees to within 2e-6.
- **Statistics:** Wilson intervals for rates, bootstrap (2,000 resamples) for AUC and kappa. Kappa is quadratic weighted,
  the standard agreement measure for DR grading.
- **Threshold:** the deployed 0.2 was compared with thresholds chosen on the *validation* set only. The two rules aimed at
  high sensitivity (validation sensitivity of at least 95%, or the maximum of sensitivity plus specificity) choose 0.24 and
  0.21 and give 91.0% and 91.9% on the test set, close to the deployed 0.2, so 0.2 does not look tuned to flatter the test
  set. (A rule that only requires 90% validation sensitivity would choose 0.52 and reach just 86.1%.)
- **Leakage audit** (`validation/leakage_audit.py`): exact duplicates plus near-duplicates found by comparing the fine retinal
  structure. Candidate pairs agree on their label 100% of the time (chance is 34%), which confirms they are true duplicates.

## Results (test set unless stated)

| Data | n (referable) | Sensitivity | Specificity | AUC | Kappa (5-class) |
|---|---|---|---|---|---|
| **Test, all images** | 548 (223) | **92.4%** (88.1-95.2) | **89.8%** (86.1-92.7) | 0.974 (0.963-0.984) | 0.834 (0.799-0.868) |
| Test, excluding images duplicated in train/val | 473 (194) | 91.2% (86.4-94.5) | 89.2% (85.1-92.4) | 0.969 (0.954-0.981) | 0.824 (0.783-0.862) |
| Validation | 550 (223) | 96.9% (93.7-98.5) | 91.4% (87.9-94.0) | 0.989 | 0.863 |
| Training sample | 500 (197) | 98.5% (95.6-99.5) | 92.4% (88.9-94.9) | 0.990 | 0.894 |

The step down from training to test (kappa 0.894 to 0.834, sensitivity 98.5% to 92.4%) shows modest overfitting. Validation
numbers are a little high because that set was used during model development; **the test column is the honest one.**

Where the misses are (test, at the deployed threshold): Moderate 15 of 150, Severe 0 of 29, Proliferative 2 of 44.

Full tables (threshold sweep, confusion matrix, per-grade recall, preprocessing comparison, leakage counts) are in
[`results/tables.md`](results/tables.md); machine-readable versions are in `results/metrics.json`.

### What a positive result means in real screening

APTOS is enriched: 41% of these images are referable. In a general diabetic clinic the share is far lower, so most flags
will be false alarms even though the model is good. Using the leakage-adjusted rates:

| Referable prevalence | Chance a flag is truly referable (PPV) | Chance a "not flagged" is truly fine (NPV) | Flagged per 1,000 patients |
|---|---|---|---|
| 20% | 68% | 97.6% | 268 |
| 10% | 49% | 98.9% | 188 |
| 5% | 31% | 99.5% | 148 |

## What this does not establish

- **One dataset, one source.** APTOS is a single public dataset (one collection programme; its details are not recorded in this repo). Nothing here shows the model works on your
  cameras, your patients, or other populations. Different devices and image quality routinely lower performance. Run it on
  local, clinician-graded images before relying on it.
- **The reference labels are imperfect.** There are 134 pairs of identical image files, and about 3 in 10 of the
  identical-looking pairs carry *conflicting* grades (44 conflicting pairs in all): the same photograph graded two different
  ways. Label noise puts a ceiling on measured accuracy and makes any single number look better or worse than the truth. How APTOS was graded (number of graders, agreement) is not
  recorded in this repo.
- **Retrospective and offline.** No prospective study, no workflow, no clinician in the loop, no measure of the effect on care.
- **Subgroups were not analysed** (age, sex, camera, image quality, diabetes type): the dataset has no such metadata.
  Performance may differ across them.
- **Rare, sight-threatening cases are few** (44 proliferative, 29 severe in the test set), so their estimates are wide and
  the two proliferative misses are a real signal, not noise.
- **The lesion overlay (Stage 2) is not the neural network** and is not evaluated here.
- **Thresholds are a policy choice.** 0.2 favours sensitivity at the cost of false alarms. Your clinical lead should decide
  the acceptable balance for your setting and population; the threshold table lets them see the trade-off.

## Recommended next steps

1. Have a clinician review these results and set the acceptable miss rate, especially for proliferative disease.
2. Build a local validation set (clinician-graded, from your own cameras) and re-run `validation/analyze.py` on it.
3. Inspect the two missed proliferative images (`753b14c27c83`, `eaa0dfbd5024`) with a clinician to see why they were missed.
4. Retrain with the duplicates removed from the test set (and consider de-duplicating training data) for cleaner estimates.
5. Check regulatory requirements: software that grades disease from medical images is usually a regulated medical device.

## Reproduce

Needs MATLAB and the APTOS data in `data/aptos2019/`. See [`README.md`](README.md).
