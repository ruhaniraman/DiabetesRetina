# Stage 3 fine-tuning: results (2026-09-24)

This compares the deployed model with two fine-tuned versions. All three are tested on the same **held-out test images**: none of them were used for training or for choosing thresholds.
- Every model gets **full-resolution photographs**, the way a clinic would upload them.
- Each model is prepared at its own input size: 224 px for the deployed model, 384 px for the fine-tuned ones.

Scripts are in `stage_3/finetune/`. Per-image predictions are in `ft_*_test.csv`, and the `ft_run1_*` and `ft_run2_*` files keep each run.

## Test results: referable DR (Moderate or worse)

| Model | Test set | Threshold | AUC | Sensitivity (95% CI) | Specificity (95% CI) | Missed referable eyes (Moderate / Severe / Proliferative) |
|---|---|---|---|---|---|---|
| Deployed (`Stage3_Final_HighSensitivity_Model.mat`) | APTOS (548) | 0.20 | 0.974 | 97.8% (94.9–99.0) | **83.7%** (79.3–87.3) | 4 / 0 / 1 |
| Run 1 | APTOS | 0.178 | 0.980 | 92.4% (88.1–95.2) | 93.8% (90.7–96.0) | 15 / 0 / 2 |
| **Run 2** (`Stage3_Finetuned_run2.mat`) | APTOS | 0.236 | 0.977 | **95.1%** (91.4–97.2) | **92.0%** (88.5–94.5) | 10 / 0 / 1 |
| Deployed | IDRiD (103) | 0.20 | 0.867 | 92.2% (83.0–96.6) | **30.8%** (18.6–46.4) | 5 / 0 / 0 |
| Run 1 | IDRiD | 0.178 | 0.897 | 90.6% (81.0–95.6) | 43.6% (29.3–59.0) | 4 / 2 / 0 |
| **Run 2** | IDRiD | 0.236 | **0.922** | 89.1% (79.1–94.6) | **71.8%** (56.2–83.5) | 6 / 1 / 0 |

Problem-statement targets: sensitivity >90% and specificity >85%.

**AUC, run 2 minus deployed:**
- APTOS: +0.003 (95% CI −0.004 to +0.010), not significant.
- IDRiD: **+0.055** (95% CI +0.011 to +0.100), significant.

## What changed

**Both runs** share this setup:
- **Starting point:** the deployed ResNet-18.
- **Training images:** full-resolution APTOS (the original competition images, not the 224 px copies), plus IDRiD training images oversampled 3×.
- **Input size:** 384×384 instead of 224×224.
- **Split:** the APTOS split recorded in `Stage3_checkpoint.mat`, and IDRiD's official test set.
- **Threshold and temperature:** fitted on validation data only.

**Run 1:** learning rate 1e-4 and light geometric augmentation. It overfitted after about epoch 3.

**Run 2** added:
- colour, brightness, contrast and hue augmentation, applied inside the retina only, plus stronger geometric augmentation;
- dropout 0.3 before the classifier;
- L2 regularisation 5e-4;
- learning rate 5e-5;
- a threshold chosen for 97% validation sensitivity.

Its best validation loss was 0.687, against 0.782 for run 1. Temperature was 1.22, meaning the raw model is slightly over-confident.

## Findings

1. **Run 2 meets both targets on APTOS:** 95.1% sensitivity and 92.0% specificity.
2. **The deployed model misses the specificity target on real photographs.** Given full-resolution photos, its APTOS specificity is 83.7%. `validation/REPORT.md` reports 89.2%, but that was measured on the 224 px copies the model was trained on.
3. **IDRiD transfer improved a lot but is not solved.** Specificity went from 31% to 72%. IDRiD sensitivity is 89.1%, with a wide interval, because only 64 test eyes are referable. The run 2 validation images from IDRiD reached 82.6% specificity. The official IDRiD test set looks harder than its training set; the deployed model showed the same gap.
4. **Messidor-2 is still to come.** It is the external benchmark, test only, and its images are awaited from ADCIS. `evaluateFinetuned` includes it automatically.

## Run 2 at lower thresholds (chosen on validation)

The run 2 threshold (0.236) aimed at 97% validation sensitivity but reached only 95.1% on the APTOS test set. Higher targets were therefore tried.
- Each threshold is chosen on the **validation split only**: 611 images, of which 550 are APTOS and 61 IDRiD.
- It uses the same rule as `finetuneStage3`.
- Each threshold was then checked **once** on test.

The validation scores come from `stage_3/finetune/scoreValidation.m` and are saved in `ft_run2_validation.csv`.

| Validation target | Threshold | APTOS test sens / spec | False alarms | Missed (Mod / Sev / PDR) | IDRiD test sens / spec |
|---|---|---|---|---|---|
| 97% (current) | 0.236 | 95.1 / 92.0 | 26 | 10 / 0 / 1 | 89.1 / 71.8 |
| 98% | 0.198 | 95.5 / 91.1 | 29 | 9 / 0 / 1 | 89.1 / 66.7 |
| **99%** | **0.096** | **96.9 / 88.3** | **38** | **6 / 0 / 1** | **90.6 / 53.8** |
| 100% | 0.028 | 98.2 / 83.7 | 53 | 3 / 0 / 1 | 96.9 / 43.6 |
| *Deployed model, 0.20* | | *97.8 / 83.7* | *53* | *4 / 0 / 1* | *92.2 / 30.8* |

- **At the 99% target (threshold 0.096):**
  - Run 2 meets both targets on the APTOS test set and on IDRiD sensitivity.
  - It raises 15 fewer false alarms than the deployed model.
  - It misses 7 referable eyes, 2 more than the deployed model's 5.
- **At the 100% target (threshold 0.028), run 2 is at least as good as the deployed model on every measure:**
  - It has the same APTOS specificity and false-alarm count.
  - It misses fewer eyes (4 against 5).
  - On IDRiD it is better on both sensitivity and specificity.
  - Like the deployed model, it misses the 85% specificity target.
- **Validation is easier than test.** Test sensitivity comes out about 2 to 3 points below the validation target. Choose the target with that gap in mind.
- **The IDRiD validation set is small.** It has 23 non-referable eyes, so validation says little about IDRiD specificity.

**Decision (2026-09-24): use 0.096.** It is now stored as `stage3Results.threshold` in `Stage3_Finetuned_run2.mat` and `Stage3_Finetuned_Model.mat`. The old value is kept as `thresholdOriginal`. IDRiD specificity is to be worked on later.

## Before deploying run 2 (a team decision)

1. **Copy the model into place:** copy `Stage3_Finetuned_run2.mat` to `Stage3_Final_HighSensitivity_Model.mat`, or point `loadStage3Model.m` at it.
   - The app reads the input size from the network, so no code changes are needed.
   - The temperature is stored but not yet used by the app.
2. **Re-run `validation/`** and regenerate `docs/CLINICAL_REVIEW.md`. Every number in them describes the old model.
3. **The miss count on APTOS test is 11 referable eyes** (10 Moderate, 1 Proliferative), against 5 for the deployed model. The deployed model catches more referable eyes but raises far more false alarms. That trade-off is a clinical call.
