# Stage 3 model validation report

**Model:** `Stage3_Final_HighSensitivity_Model.mat` (class-weighted ResNet, deployed in the app).
**Pipeline evaluated:** the app's current one: crop the black border around the retina, pad to a square, resize to 224 px, and average the
scores of the image and its mirror image. Earlier versions of this report evaluated a plain resize (what the network was trained with); why the
app changed, and both sets of numbers, are in [`results/stage3_pipeline.md`](results/stage3_pipeline.md).
**Data:** APTOS 2019, 3,662 fundus photographs, the split recorded by the model's own training run.
**Purpose:** find out how well the model really works on images it never trained on, and whether the app uses it the way it was validated.

> This is an internal technical validation on one public dataset. It is **not** clinical validation and does not show the
> tool is safe or effective for patients. See [What this does not establish](#what-this-does-not-establish).

## Bottom line

1. **On held-out images the model performs well as a referral screen.** Test set (548 images, never trained on):
   it flags **95.1%** of referable patients (95% CI 91.4-97.2%) and correctly clears **89.2%** of non-referable ones
   (85.4-92.2%); AUC **0.977**. "Referable" means moderate non-proliferative DR or worse.
2. **The exact stage is much less reliable than the referral decision.** The five-way grade is right 78.1% of the time,
   and only 48% of proliferative and 52% of severe cases are labelled as such. Of the 44 proliferative test cases, 21 were
   graded proliferative, 10 Moderate (two grades away), 7 Severe and 6 Mild. Use the referral flag, treat the stage as an
   estimate.
3. **The model misses some serious disease.** 1 of 44 proliferative and 10 of 150 moderate test cases were not flagged.
   The proliferative miss (`eaa0dfbd5024`) was called *Mild* with a referral probability of 0.04; it is not a duplicate
   image. No screening tool of this kind catches everything, and the app now says so.
4. **Problems in the app were found and fixed** (below): it used the wrong preprocessing, it ignored the model's tuned referral
   threshold, and later the input preparation was changed again after a comparison showed it works better on wide-frame cameras.
5. **The stored test numbers are slightly optimistic.** 13.7% of test images have a duplicate in the training or
   validation data. Excluding them, sensitivity is 94.3% and specificity 88.9%.
6. **It does not transfer cleanly to a second dataset.** On IDRiD (516 full-resolution photographs it never saw), sensitivity held
   (**92.3%**, 88.8-94.7) but specificity fell to **67.4%** (60.5-73.6; AUC 0.926): it flagged a third of the healthy eyes. (With the earlier plain
   resize it was 94.4% and 46.1%, AUC 0.900; the change in preparation is why it is better, see below.) Performance depends on the
   camera and population, and must be re-measured on your own images before any real use. Details in
   [`QUALITY.md`](QUALITY.md#a-larger-finding-the-classifier-does-not-transfer-to-another-dataset-well).

## Problems found in the app, and what was changed

| Finding | Evidence | Change |
|---|---|---|
| **Wrong preprocessing (found first).** The app cropped each photo to the retina and padded it; the model was trained on plain resized images. | Plain resize reproduces the model's own stored test result **exactly** (TP 206 / TN 292 / FP 33 / FN 17) and the baseline network's saved predictions **548/548**. Cropping agreed only 92.3% of the time. | The app was switched to plain resize (one shared function for Stage 3 and the Grad-CAM). |
| **Plain resize is not the best input for other cameras (found later).** IDRiD photographs are wide 3:2 frames with large black borders; squashing them into a square hurts. | On APTOS the retina crop performs the same as plain resize (AUC 0.972 vs 0.974, difference -0.002, 95% interval -0.006 to +0.002). On IDRiD it raises AUC from 0.900 to 0.924 (difference +0.023, +0.011 to +0.036). Averaging with the mirror image adds a little (APTOS test +0.003, not significant; IDRiD +0.025 overall). Padding without cropping gives 0.915 and cropping then stretching 0.914, so both the distortion and the wasted border matter. | The app now crops the retina and averages the image with its mirror image (`utils/preprocessStage3Input.m`, `utils/stage3Scores.m`), and the threshold stays 0.20. Full tables: `results/stage3_pipeline.md`. The IDRiD comparison was looked at while choosing, so it is directional rather than a clean held-out result. |
| **The tuned referral threshold was ignored.** The app decided from the single most-likely grade. | On the test set (measured at the time, with plain resize) that rule found 187 of 223 referable patients (**83.9%**) and the threshold rule (referable probability >= 0.2) 206 (**92.4%**): **19 more patients caught**, 15 more false alarms. With today's pipeline: 183 (82.1%) against 212 (**95.1%**). | The backend applies the threshold. An eye it flags is never shown as routine: the overall grade is raised to at least Stage 2 and the summary explains why. The dashboard shows a "Referral flagged" chip and the report shows each eye's referral probability. |

A real example from the test set: image `10ecc5292ab1` (true grade Moderate) was called *Mild* by the model, with a referral
probability of 49%. The old app showed it as Stage 1, routine; the app now shows it as referable.

## Method

- **Held-out data is provably held out.** `stage_3/Stage3_checkpoint.mat` stores the exact train (2,564) / validation (550) /
  test (548) split. The three sets do not overlap, cover all 3,662 images exactly once, match `train.csv` labels for every
  image, and the test set's class counts match the model's stored results (223 referable, 325 non-referable).
- **Predictions** come from the model itself on those images, prepared exactly as the app prepares them
  (`validation/run_deployed_predictions.py` calls the app's own MATLAB functions). The app's live grading function was checked against these
  predictions and agrees to within 4e-6.
- **Statistics:** Wilson intervals for rates, bootstrap (2,000 resamples) for AUC and kappa. Kappa is quadratic weighted,
  the standard agreement measure for DR grading.
- **Threshold:** the deployed 0.2 was compared with thresholds chosen on the *validation* set only. The two rules aimed at
  high sensitivity (validation sensitivity of at least 95%, or the maximum of sensitivity plus specificity) choose 0.31 and
  0.27 and give 92.4% / 92.6% and 94.2% / 91.4% (sensitivity / specificity) on the test set, against 95.1% / 89.2% at the deployed 0.2. The 0.2 was tuned
  for the plain-resize input and was kept because it favours sensitivity and moving it would be a policy change. (A rule that only requires 90% validation
  sensitivity would choose 0.43 and reach just 87.4%.)
- **Leakage audit** (`validation/leakage_audit.py`): exact duplicates plus near-duplicates found by comparing the fine retinal
  structure. Candidate pairs agree on their label 100% of the time (chance is 34%), which confirms they are true duplicates.

## Results (test set unless stated)

| Data | n (referable) | Sensitivity | Specificity | AUC | Kappa (5-class) |
|---|---|---|---|---|---|
| **Test, all images** | 548 (223) | **95.1%** (91.4-97.2) | **89.2%** (85.4-92.2) | 0.977 (0.966-0.986) | 0.837 (0.798-0.873) |
| Test, excluding images duplicated in train/val | 473 (194) | 94.3% (90.1-96.8) | 88.9% (84.7-92.1) | 0.973 (0.960-0.984) | 0.832 (0.787-0.871) |
| Validation | 550 (223) | 99.1% (96.8-99.8) | 89.3% (85.5-92.2) | 0.990 | 0.875 |
| Training sample | 500 (197) | 99.0% (96.4-99.7) | 91.1% (87.3-93.8) | 0.993 | 0.901 |

The step down from training to test (kappa 0.901 to 0.837, sensitivity 99.0% to 95.1%) shows modest overfitting. Validation
numbers are a little high because that set was used during model development; **the test column is the honest one.**

Where the misses are (test, at the deployed threshold): Moderate 10 of 150, Severe 0 of 29, Proliferative 1 of 44.

Full tables (threshold sweep, confusion matrix, per-grade recall, preprocessing comparison, leakage counts) are in
[`results/tables.md`](results/tables.md); machine-readable versions are in `results/metrics.json`.

### What a positive result means in real screening

APTOS is enriched: 41% of these images are referable. In a general diabetic clinic the share is far lower, so most flags
will be false alarms even though the model is good. Using the leakage-adjusted rates:

| Referable prevalence | Chance a flag is truly referable (PPV) | Chance a "not flagged" is truly fine (NPV) | Flagged per 1,000 patients |
|---|---|---|---|
| 20% | 68% | 98.4% | 278 |
| 10% | 49% | 99.3% | 194 |
| 5% | 31% | 99.7% | 153 |

## What this does not establish

- **Two datasets, and they disagree.** Everything above is APTOS. A second public dataset (IDRiD) gave similar sensitivity (92% vs 95%) but lower specificity (67% vs 89%), so results clearly do not carry over automatically. Nothing here shows the model works on your
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
  the proliferative miss is a real signal, not noise.
- **The lesion overlay (Stage 2) is not the neural network.** It is evaluated separately in [`LESIONS.md`](LESIONS.md): it does not detect lesions, and is off by default.
- **Thresholds are a policy choice.** 0.2 favours sensitivity at the cost of false alarms. Your clinical lead should decide
  the acceptable balance for your setting and population; the threshold table lets them see the trade-off.

## Recommended next steps

1. Have a clinician review these results and set the acceptable miss rate, especially for proliferative disease.
2. Build a local validation set (clinician-graded, from your own cameras) and re-run `validation/analyze.py` on it.
3. Inspect the missed proliferative image (`eaa0dfbd5024`; the earlier pipeline also missed `753b14c27c83`) with a clinician to see why it was missed.
4. Retrain with the duplicates removed from the test set (and consider de-duplicating training data) for cleaner estimates.
5. Check regulatory requirements: software that grades disease from medical images is usually a regulated medical device.

## Reproduce

Needs MATLAB and the APTOS data in `data/aptos2019/`. See [`README.md`](README.md).
