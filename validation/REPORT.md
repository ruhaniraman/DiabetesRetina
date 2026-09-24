# Stage 3 model validation report

**Model:** `Stage3_Final_HighSensitivity_Model.mat`, the fine-tuned ResNet-18 deployed on 2026-09-24 (run 2 in
[`results/stage3_finetune.md`](results/stage3_finetune.md)). It is trained at 384 px on full-resolution APTOS plus IDRiD's training set,
starting from the previous model.
**Pipeline evaluated:** the app's. Crop the black border around the retina, pad to a square, resize to the network's input size (384 px), and
average the scores of the image and its mirror image. An eye is flagged for referral when P(Moderate)+P(Severe)+P(Proliferative) is at least
**0.096**; that threshold was chosen on the validation split for 99% referable sensitivity.
**Data:** APTOS 2019, 3,662 fundus photographs, the train/validation/test split recorded by the original training run (the fine-tune used the same
split). Every figure uses the **full-resolution photographs**, as a clinic would upload them.
**Purpose:** find out how well the model really works on images it never trained on, and whether the app uses it the way it was validated.

> This is an internal technical validation on public datasets. It is **not** clinical validation and does not show the
> tool is safe or effective for patients. See [What this does not establish](#what-this-does-not-establish).

## Bottom line

1. **On held-out images the model meets the problem-statement targets as a referral screen.** Test set (548 images, never trained on):
   it flags **96.9%** of referable patients (95% CI 93.7-98.5%) and correctly leaves **88.3%** of non-referable ones unflagged
   (84.4-91.4%); AUC **0.977**, 5-class kappa 0.860. Targets: sensitivity above 90%, specificity above 85%.
2. **It is better than the model it replaced, on the same photographs.** The previous model was trained on 224 px copies. On the
   full-resolution photographs its specificity was **83.7%** (below target) at 97.8% sensitivity; the 89.2% this report used to show was measured on
   the 224 px copies. On IDRiD's official test set specificity rose from 30.8% to **53.8%** and AUC from 0.867 to 0.922 (section 7 of
   [`results/tables.md`](results/tables.md); the AUC difference is significant, see `results/stage3_finetune.md`).
3. **The exact stage is still less reliable than the referral decision.** The five-way grade is right 79.4% of the time; 62% of Severe and 57% of
   Proliferative cases are labelled as such. Use the referral flag, treat the stage as an estimate.
4. **It still misses some serious disease.** 7 of 223 referable test cases were not flagged: 6 of 150 Moderate and 1 of 44 Proliferative.
   The proliferative miss (`eaa0dfbd5024`, called *Mild*, referral score 0.03) is the same image the previous model missed.
5. **Confidence is now calibrated.** The raw network is over-confident, so the app reports a temperature-scaled confidence (T = 1.22, fitted on
   validation). On the test set the "High" band claims 99% and the stage is right 98% of the time; the referral decision is wrong in 0.7% of
   High-confidence results and 15.5% of the rest ([`results/calibration.md`](results/calibration.md)).
6. **The stored test numbers are slightly optimistic.** 13.7% of test images have a duplicate in the training or validation data. Excluding them,
   sensitivity is 96.4% and specificity 87.8%.
7. **Other cameras remain the weak point.** On IDRiD's test set (103 photographs) sensitivity is 90.6% but specificity only **53.8%**: it flags
   46% of eyes without referable disease. This is below target, so each site should calibrate its own threshold (`calibration/`; an IDRiD example is in
   [`results/site_calibration_idrid.md`](results/site_calibration_idrid.md)).

## Results (test set unless stated)

| Data | n (referable) | Sensitivity | Specificity | AUC | Kappa (5-class) |
|---|---|---|---|---|---|
| **Test, all images** | 548 (223) | **96.9%** (93.7-98.5) | **88.3%** (84.4-91.4) | 0.977 (0.965-0.987) | 0.860 (0.824-0.890) |
| Test, excluding images duplicated in train/val | 473 (194) | 96.4% (92.7-98.2) | 87.8% (83.5-91.1) | 0.974 (0.959-0.985) | 0.860 (0.821-0.894) |
| Validation | 550 (223) | 99.1% (96.8-99.8) | 88.7% (84.8-91.7) | 0.989 | 0.916 |
| Training sample | 500 (197) | 100.0% (98.1-100.0) | 89.1% (85.1-92.1) | 0.998 | 0.941 |
| IDRiD official test set | 103 (64) | 90.6% (81.0-95.6) | 53.8% (38.6-68.4) | 0.922 (0.861-0.968) | |

The validation numbers are a little high because the threshold was chosen on that set; **the test column is the honest one.** The training sample shows
the model fits its training data closely (kappa 0.941 against 0.860 on test).

**Threshold.** 0.096 was chosen on validation for 99% sensitivity. Rules that trade sensitivity for specificity, also chosen on validation only, give
on the test set 93.3% / 92.6% (maximum Youden J, 0.30) and 88.8% / 95.7% (validation sensitivity at least 90%, 0.54). Where to sit on that
curve is a clinical decision; the threshold sweep is in [`results/tables.md`](results/tables.md) section 4.

**Decision rule.** Deciding from the single most-likely grade instead of the threshold finds 89.2% of referable patients (199 of 223) against 96.9% (216):
17 more patients caught for 25 more false alarms, which is why the app uses the threshold.

### What a positive result means in real screening

APTOS is enriched: 41% of these images are referable. In a general diabetic clinic the share is far lower, so most flags will be false alarms even
though the model is good. Using the leakage-adjusted rates:

| Referable prevalence | Chance a flag is truly referable (PPV) | Chance a "not flagged" is truly fine (NPV) | Flagged per 1,000 patients |
|---|---|---|---|
| 20% | 66% | 99.0% | 290 |
| 10% | 47% | 99.5% | 206 |
| 5% | 29% | 99.8% | 164 |

## History: the previous model and the fixes that carried over

Until 2026-09-24 the app used a ResNet trained at 224 px on the 224 px APTOS copies only. On those copies it reached 95.1% sensitivity and 89.2%
specificity (test set, threshold 0.20); on the full-resolution photographs a clinic uploads, 97.8% and 83.7%. Its prediction files
(`results/app_<split>_<method>.csv`) and sections 1 and 5d of `results/tables.md` are kept as the record. The fixes below were found with that model
and are still how the app works.

### Problems found in the app, and what was changed

| Finding | Evidence | Change |
|---|---|---|
| **Wrong preprocessing (found first).** The app cropped each photo to the retina and padded it; the model was trained on plain resized images. | Plain resize reproduces the model's own stored test result **exactly** (TP 206 / TN 292 / FP 33 / FN 17) and the baseline network's saved predictions **548/548**. Cropping agreed only 92.3% of the time. | The app was switched to plain resize (one shared function for Stage 3 and the Grad-CAM). |
| **Plain resize is not the best input for other cameras (found later).** IDRiD photographs are wide 3:2 frames with large black borders; squashing them into a square hurts. | On APTOS the retina crop performs the same as plain resize (AUC 0.972 vs 0.974, difference -0.002, 95% interval -0.006 to +0.002). On IDRiD it raises AUC from 0.900 to 0.924 (difference +0.023, +0.011 to +0.036). Averaging with the mirror image adds a little (APTOS test +0.003, not significant; IDRiD +0.025 overall). Padding without cropping gives 0.915 and cropping then stretching 0.914, so both the distortion and the wasted border matter. | The app now crops the retina and averages the image with its mirror image (`utils/preprocessStage3Input.m`, `utils/stage3Scores.m`), and the threshold stays 0.20. Full tables: `results/stage3_pipeline.md`. The IDRiD comparison was looked at while choosing, so it is directional rather than a clean held-out result. |
| **The tuned referral threshold was ignored.** The app decided from the single most-likely grade. | On the test set (measured at the time, with plain resize) that rule found 187 of 223 referable patients (**83.9%**) and the threshold rule (referable probability >= 0.2) 206 (**92.4%**): **19 more patients caught**, 15 more false alarms. With today's pipeline: 183 (82.1%) against 212 (**95.1%**). | The backend applies the threshold. An eye it flags is never shown as routine: the overall grade is raised to at least Stage 2 and the summary explains why. The dashboard shows a "Referral flagged" chip and the report shows each eye's referral probability. |

A real example from the test set: image `10ecc5292ab1` (true grade Moderate) was called *Mild* by the model, with a referral
probability of 49%. The old app showed it as Stage 1, routine; the app now shows it as referable.

## Method

- **Held-out data is provably held out.** `stage_3/Stage3_checkpoint.mat` stores the exact train (2,564) / validation (550) /
  test (548) split. The three sets do not overlap, cover all 3,662 images exactly once, and match `train.csv` labels for every image. The fine-tune
  reused this split (`stage_3/finetune/splits.csv` agrees image for image), and IDRiD's official test set was never trained on.
- **Predictions** come from the deployed model on the full-resolution photographs (`data/aptos2019_full`), prepared exactly as the app prepares them
  (`validation/run_deployed_predictions.py` calls the app's own MATLAB functions). They match the fine-tuning evaluation to within 4e-4.
- **Statistics:** Wilson intervals for rates, bootstrap (2,000 resamples) for AUC and kappa. Kappa is quadratic weighted,
  the standard agreement measure for DR grading.
- **Calibration:** temperature scaling fitted on the validation split, reported on the test sets as expected calibration error and reliability
  diagrams (`validation/calibration_eval.py`).
- **Leakage audit** (`validation/leakage_audit.py`): exact duplicates plus near-duplicates found by comparing the fine retinal
  structure. Candidate pairs agree on their label 100% of the time (chance is 34%), which confirms they are true duplicates.

Full tables (threshold sweep, confusion matrix, per-grade recall, model comparison, leakage counts) are in
[`results/tables.md`](results/tables.md); machine-readable versions are in `results/metrics.json`.

## What this does not establish

- **Two datasets, and they disagree.** On APTOS the model meets the targets; on IDRiD's test set specificity is 53.8%. Results clearly do not carry
  over automatically. Nothing here shows the model works on your cameras, your patients, or other populations: run it on local, clinician-graded
  images before relying on it (`calibration/`). Messidor-2, the planned external benchmark, has not been run: its images are awaited from ADCIS.
- **IDRiD is not a fully unseen camera for this model.** It trained on IDRiD's training photographs; only the 103 test photographs are held out.
- **The reference labels are imperfect.** There are 134 pairs of identical image files, and about 3 in 10 of the
  identical-looking pairs carry *conflicting* grades (44 conflicting pairs in all). Label noise puts a ceiling on measured accuracy.
- **Retrospective and offline.** No prospective study, no workflow, no clinician in the loop, no measure of the effect on care.
- **Subgroups were not analysed** (age, sex, camera, image quality, diabetes type): the dataset has no such metadata.
- **Rare, sight-threatening cases are few** (44 proliferative, 29 severe in the test set), so their estimates are wide, and
  the proliferative miss is a real signal, not noise.
- **Thresholds are a policy choice.** 0.096 favours sensitivity at the cost of false alarms. Your clinical lead should decide
  the acceptable balance for your setting and population; the threshold table lets them see the trade-off.

## Recommended next steps

1. Have a clinician review these results and set the acceptable miss rate, especially for proliferative disease.
2. Run the Messidor-2 external benchmark once the images arrive (`stage_3/finetune/evaluateFinetuned.m` includes it automatically).
3. Build a local validation set (clinician-graded, from your own cameras) and calibrate the threshold with `calibration/`.
4. Inspect the missed proliferative image (`eaa0dfbd5024`, missed by both models) with a clinician.
5. Check regulatory requirements: software that grades disease from medical images is usually a regulated medical device.

## Reproduce

Needs MATLAB and the full-resolution APTOS data in `data/aptos2019_full/`: `python validation/run_deployed_predictions.py`, then
`python validation/analyze.py` and `python validation/calibration_eval.py`. See [`README.md`](README.md).
