# Referral-threshold calibration report: IDRiD, standing in for a clinic (a different dataset from the one the model was tuned on)

Generated 2026-09-21. Model threshold in use: **0.20** (referral score; an eye is flagged at or above it).

> **This report is evidence, not approval.** The acceptable miss rate is a clinical decision, and changing the threshold changes the balance between missed disease and false referrals. A qualified clinician must choose the sensitivity target and approve any change. It describes only the images analysed here; it does not show the tool is suitable for patients.

## 1. The data

- **511 graded images**: 319 referable (moderate or worse) and 192 not referable (62.4% referable).
- By grade: No_DR 167, Mild 25, Moderate 165, Severe 93, Proliferate_DR 61.
- Photo-quality check: 483 accepted, 28 accepted with a warning, 5 rejected (rejected photos are excluded from every figure below).
- Ability of the score to separate referable from non-referable eyes (AUC): **0.927**.

## 2. Result at the threshold now in use

At 0.20: sensitivity **92.5% (89.0% to 94.9%)**, specificity **67.2% (60.3% to 73.4%)**; 24 of 319 referable cases not flagged, 63 of 192 non-referable eyes flagged (70% of all images flagged).

## 3. What each sensitivity target would cost on this data

Each row is the highest threshold (fewest false referrals) whose sensitivity reaches the target, with the LOWER end of its 95% confidence interval reaching it. These figures are measured on the same images the threshold was chosen on, so they are optimistic (see section 4).

| Sensitivity target | Threshold | Sensitivity (95% CI) | Specificity (95% CI) | Images flagged |
|---|---|---|---|---|
| 85% | 0.31 | 89.0% (85.1% to 92.0%) | 78.1% (71.8% to 83.4%) | 64% |
| 90% | 0.18 | 94.7% (91.6% to 96.6%) | 66.1% (59.2% to 72.5%) | 72% |
| 95% | 0.03 | 97.8% (95.5% to 98.9%) | 33.3% (27.0% to 40.3%) | 86% |
| 97% | not reachable | | | |

## 4. Recommendation

For a sensitivity target of **90%**: threshold **0.18** (currently 0.20).

| | On all the data (optimistic) | On images not used to choose it (fair) |
|---|---|---|
| Sensitivity | 94.7% (91.6% to 96.6%) | 94.2% on average; the worst 5% of splits were below 88.5% |
| Specificity | 66.1% (59.2% to 72.5%) | 64.6% on average |
| Reached the target on unseen images | | 92% of 300 repeated splits |

The threshold that would be chosen varies with the sample: median 0.18 (middle 80% of splits: 0.13 to 0.19). A wide spread means the sample is too small to pin the threshold down.

To know a sensitivity of 90% to within about 5 points, roughly 139 referable cases are needed; this sample has 319.

## 5. What a flag means at your prevalence

Using the prevalence you supplied (10.0% referable). A graded sample is usually enriched with disease; a screening clinic is not, and the chance that a flag is a true referral falls as disease gets rarer.

| Threshold | Chance a flag is truly referable | Chance a non-flag is truly fine | Flagged per 1,000 patients |
|---|---|---|---|
| 0.20 (in use) | 24% | 98.8% | 388 |
| 0.18 (recommended) | 24% | 99.1% | 399 |

## 6. Referable cases NOT flagged at the recommended threshold

Have a clinician look at these: they are the cases the tool would miss.

| Image | Grade | Referral score |
|---|---|---|
| a. Training Set/IDRiD_260 | Moderate | 0.00 |
| a. Training Set/IDRiD_201 | Moderate | 0.00 |
| b. Testing Set/IDRiD_084 | Moderate | 0.01 |
| a. Training Set/IDRiD_283 | Moderate | 0.02 |
| a. Training Set/IDRiD_252 | Moderate | 0.03 |
| a. Training Set/IDRiD_311 | Moderate | 0.03 |
| a. Training Set/IDRiD_262 | Moderate | 0.03 |
| b. Testing Set/IDRiD_082 | Moderate | 0.03 |
| a. Training Set/IDRiD_263 | Moderate | 0.03 |
| a. Training Set/IDRiD_215 | Moderate | 0.04 |
| a. Training Set/IDRiD_412 | Moderate | 0.08 |
| a. Training Set/IDRiD_282 | Moderate | 0.08 |
| b. Testing Set/IDRiD_079 | Moderate | 0.09 |
| b. Testing Set/IDRiD_012 | Moderate | 0.11 |
| a. Training Set/IDRiD_303 | Moderate | 0.12 |
| a. Training Set/IDRiD_208 | Moderate | 0.12 |
| b. Testing Set/IDRiD_086 | Moderate | 0.14 |

## 7. If you decide to change the threshold

1. Get written sign-off from your clinical lead for a sensitivity target and the resulting threshold (0.18).
2. Set it in `backend/.env` as `REFERRAL_THRESHOLD=<value>` (accepted range 0.02 to 0.6) and restart the backend. Every result then shows the effective threshold, and `/api/health` reports it.
3. Keep this report and the graded sample with your records, and repeat the calibration when the camera, the operator, or the patient population changes.
4. The minimum for any recommendation is 30 referable cases; 140 referable and 140 non-referable are comfortable.
