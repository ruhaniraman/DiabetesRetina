# Referral-threshold calibration report: IDRiD, standing in for a clinic (a different dataset from the one the model was tuned on)

Generated 2026-09-21. Model threshold in use: **0.20** (referral score; an eye is flagged at or above it).

> **This report is evidence, not approval.** The acceptable miss rate is a clinical decision, and changing the threshold changes the balance between missed disease and false referrals. A qualified clinician must choose the sensitivity target and approve any change. It describes only the images analysed here; it does not show the tool is suitable for patients.

## 1. The data

- **511 graded images**: 319 referable (moderate or worse) and 192 not referable (62.4% referable).
- By grade: No_DR 167, Mild 25, Moderate 165, Severe 93, Proliferate_DR 61.
- Photo-quality check: 483 accepted, 28 accepted with a warning, 5 rejected (rejected photos are excluded from every figure below).
- Ability of the score to separate referable from non-referable eyes (AUC): **0.902**.

## 2. Result at the threshold now in use

At 0.20: sensitivity **94.7% (91.6% to 96.6%)**, specificity **45.8% (38.9% to 52.9%)**; 17 of 319 referable cases not flagged, 104 of 192 non-referable eyes flagged (79% of all images flagged).

## 3. What each sensitivity target would cost on this data

Each row is the highest threshold (fewest false referrals) whose sensitivity reaches the target, with the LOWER end of its 95% confidence interval reaching it. These figures are measured on the same images the threshold was chosen on, so they are optimistic (see section 4).

| Sensitivity target | Threshold | Sensitivity (95% CI) | Specificity (95% CI) | Images flagged |
|---|---|---|---|---|
| 85% | 0.65 | 89.0% (85.1% to 92.0%) | 69.8% (63.0% to 75.8%) | 67% |
| 90% | 0.36 | 93.4% (90.1% to 95.7%) | 54.7% (47.6% to 61.6%) | 75% |
| 95% | 0.05 | 98.1% (96.0% to 99.1%) | 31.2% (25.1% to 38.1%) | 87% |
| 97% | 0.04 | 99.1% (97.3% to 99.7%) | 29.2% (23.2% to 36.0%) | 88% |

## 4. Recommendation

For a sensitivity target of **90%**: threshold **0.36** (currently 0.20).

| | On all the data (optimistic) | On images not used to choose it (fair) |
|---|---|---|
| Sensitivity | 93.4% (90.1% to 95.7%) | 94.0% on average; the worst 5% of splits were below 89.6% |
| Specificity | 54.7% (47.6% to 61.6%) | 50.5% on average |
| Reached the target on unseen images | | 92% of 300 repeated splits |

The threshold that would be chosen varies with the sample: median 0.29 (middle 80% of splits: 0.17 to 0.37). A wide spread means the sample is too small to pin the threshold down.

To know a sensitivity of 90% to within about 5 points, roughly 139 referable cases are needed; this sample has 319.

## 5. What a flag means at your prevalence

Using the prevalence you supplied (10.0% referable). A graded sample is usually enriched with disease; a screening clinic is not, and the chance that a flag is a true referral falls as disease gets rarer.

| Threshold | Chance a flag is truly referable | Chance a non-flag is truly fine | Flagged per 1,000 patients |
|---|---|---|---|
| 0.20 (in use) | 16% | 98.7% | 582 |
| 0.36 (recommended) | 19% | 98.7% | 501 |

## 6. Referable cases NOT flagged at the recommended threshold

Have a clinician look at these: they are the cases the tool would miss.

| Image | Grade | Referral score |
|---|---|---|
| a. Training Set/IDRiD_180 | Severe | 0.10 |
| a. Training Set/IDRiD_260 | Moderate | 0.02 |
| b. Testing Set/IDRiD_084 | Moderate | 0.03 |
| a. Training Set/IDRiD_263 | Moderate | 0.04 |
| a. Training Set/IDRiD_201 | Moderate | 0.04 |
| a. Training Set/IDRiD_208 | Moderate | 0.04 |
| a. Training Set/IDRiD_412 | Moderate | 0.05 |
| a. Training Set/IDRiD_262 | Moderate | 0.05 |
| a. Training Set/IDRiD_283 | Moderate | 0.05 |
| a. Training Set/IDRiD_248 | Moderate | 0.06 |
| a. Training Set/IDRiD_247 | Moderate | 0.09 |
| a. Training Set/IDRiD_303 | Moderate | 0.10 |
| a. Training Set/IDRiD_311 | Moderate | 0.11 |
| a. Training Set/IDRiD_282 | Moderate | 0.15 |
| b. Testing Set/IDRiD_082 | Moderate | 0.17 |
| a. Training Set/IDRiD_300 | Moderate | 0.17 |
| a. Training Set/IDRiD_252 | Moderate | 0.18 |
| a. Training Set/IDRiD_215 | Moderate | 0.21 |
| a. Training Set/IDRiD_284 | Moderate | 0.30 |
| a. Training Set/IDRiD_270 | Moderate | 0.30 |
| b. Testing Set/IDRiD_100 | Moderate | 0.35 |

## 7. If you decide to change the threshold

1. Get written sign-off from your clinical lead for a sensitivity target and the resulting threshold (0.36).
2. Set it in `backend/.env` as `REFERRAL_THRESHOLD=<value>` (accepted range 0.02 to 0.6) and restart the backend. Every result then shows the effective threshold, and `/api/health` reports it.
3. Keep this report and the graded sample with your records, and repeat the calibration when the camera, the operator, or the patient population changes.
4. The minimum for any recommendation is 30 referable cases; 140 referable and 140 non-referable are comfortable.
