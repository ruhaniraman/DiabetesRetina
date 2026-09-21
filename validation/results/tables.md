## 1. Which preprocessing reproduces the stored test results?

The model's own record (`stage3Results`, test split, threshold 0.2): TP 206, TN 292, FP 33, FN 17.

| Preprocessing | TP | TN | FP | FN | Matches stored result? |
|---|---|---|---|---|---|
| crop to retina + pad + resize (`preprocessForNetwork`) | 209 | 292 | 33 | 14 | no |
| plain resize | 206 | 292 | 33 | 17 | **yes, exactly** |

Control: the *baseline* network saved its own test predictions. Fresh predictions vs those saved ones:

| Preprocessing | Identical to the saved prediction |
|---|---|
| crop | 506/548 (92.3%) |
| resize | 548/548 (100.0%) |

The baseline's saved predictions are best reproduced by **resize** preprocessing.

## 2. Held-out performance of the deployed model

Referable = moderate NPDR or worse. Operating point: referable probability >= 0.2. 95% intervals: Wilson (rates), bootstrap (AUC, kappa).

| Data | n (referable) | Sensitivity | Specificity | AUC | Kappa (5-class) | 5-class accuracy |
|---|---|---|---|---|---|---|
| test (all) | 548 (223) | 92.4% (88.1%-95.2%) | 89.8% (86.1%-92.7%) | 0.974 (0.963-0.984) | 0.834 (0.799-0.868) | 77.7% (74.1%-81.0%) |
| test (excluding images duplicated in train/val) | 473 (194) | 91.2% (86.4%-94.5%) | 89.2% (85.1%-92.4%) | 0.969 (0.954-0.981) | 0.824 (0.783-0.862) | 77.4% (73.4%-80.9%) |
| validation | 550 (223) | 96.9% (93.7%-98.5%) | 91.4% (87.9%-94.0%) | 0.989 (0.982-0.994) | 0.863 (0.830-0.892) | 80.7% (77.2%-83.8%) |
| training sample (500) | 500 (197) | 98.5% (95.6%-99.5%) | 92.4% (88.9%-94.9%) | 0.990 (0.984-0.995) | 0.894 (0.859-0.925) | 86.8% (83.6%-89.5%) |

## 3. Per-grade behaviour on the test set (5-class argmax)

| True grade | n | Recognised as that grade |
|---|---|---|
| No_DR | 270 | 97% |
| Mild | 55 | 62% |
| Moderate | 150 | 63% |
| Severe | 29 | 59% |
| Proliferate_DR | 44 | 41% |

Misses (referable images called non-referable) by true grade at the deployed threshold:

| True grade | Referable images | Missed |
|---|---|---|
| Moderate | 150 | 15 |
| Severe | 29 | 0 |
| Proliferate_DR | 44 | 2 |

## 4. Threshold behaviour (deployed model, plain-resize preprocessing)

| Threshold | Val sens | Val spec | Test sens | Test spec |
|---|---|---|---|---|
| 0.05 | 99.6% | 82.6% | 97.3% | 84.9% |
| 0.10 | 99.1% | 86.9% | 96.9% | 88.6% |
| 0.15 | 97.3% | 89.6% | 95.5% | 89.8% |
| 0.20 (deployed) | 96.9% | 91.4% | 92.4% | 89.8% |
| 0.25 | 94.6% | 92.7% | 91.0% | 90.5% |
| 0.30 | 93.7% | 93.9% | 89.7% | 91.4% |
| 0.40 | 91.9% | 95.1% | 87.4% | 92.3% |
| 0.50 | 90.1% | 96.6% | 86.5% | 94.8% |
| 0.60 | 87.4% | 97.9% | 83.4% | 95.4% |
| 0.70 | 82.5% | 98.2% | 78.0% | 96.6% |

Thresholds chosen using the **validation** set only, then applied unchanged to the **test** set (the honest way to set an operating point):

| Rule (chosen on validation) | Threshold | Test sensitivity | Test specificity |
|---|---|---|---|
| highest threshold with validation sensitivity >= 90% | 0.52 | 86.1% (80.9%-90.0%) | 95.1% (92.2%-96.9%) |
| highest threshold with validation sensitivity >= 95% | 0.24 | 91.0% (86.6%-94.1%) | 90.5% (86.8%-93.2%) |
| maximum Youden J on validation | 0.21 | 91.9% (87.6%-94.8%) | 90.2% (86.4%-92.9%) |

## 5. What the numbers mean in a real screening population

APTOS is enriched with disease: about 41% of these images are referable. In a general diabetic screening clinic the share is far lower, which changes what a positive result means (positive/negative predictive value).

Using the leakage-adjusted test sensitivity (91.2%) and specificity (89.2%):

| Referable prevalence in the screened population | Positive predictive value | Negative predictive value | Of 1,000 patients: flagged | of which truly referable |
|---|---|---|---|---|
| 41% | 85.5% | 93.6% | 438 | 374 |
| 20% | 68.0% | 97.6% | 268 | 182 |
| 10% | 48.5% | 98.9% | 188 | 91 |
| 5% | 30.9% | 99.5% | 148 | 46 |

## 5b. Decision rule: most-likely grade vs the tuned referable-probability threshold

The model was tuned to flag an eye as referable when the summed probability of Moderate, Severe and Proliferate is at least 0.2 (the 'high sensitivity' operating point). Deciding instead from the single most-likely grade (argmax) ignores that tuning.

| Rule (test set) | Referable found | Referable missed | False alarms | Sensitivity | Specificity |
|---|---|---|---|---|---|
| most-likely grade (argmax) | 187 | 36 | 18 | 83.9% (78.5%-88.1%) | 94.5% (91.4%-96.5%) |
| referable probability >= 0.2 | 206 | 17 | 33 | 92.4% (88.1%-95.2%) | 89.8% (86.1%-92.7%) |

## 5c. Full confusion matrix (test set, rows = true grade, columns = most-likely grade)

| True / Predicted | No_DR | Mild | Moderate | Severe | Proliferate_DR |
|---|---|---|---|---|---|
| No_DR | 263 | 3 | 3 | 1 | 0 |
| Mild | 7 | 34 | 13 | 0 | 1 |
| Moderate | 8 | 22 | 94 | 11 | 15 |
| Severe | 0 | 0 | 7 | 17 | 5 |
| Proliferate_DR | 0 | 6 | 13 | 7 | 18 |

Severe or Proliferate images NOT flagged at the deployed threshold:

| Image | True grade | Referable probability | Most likely grade | Has duplicate in train/val |
|---|---|---|---|---|
| 753b14c27c83 | Proliferate_DR | 0.15 | Mild | no |
| eaa0dfbd5024 | Proliferate_DR | 0.02 | Mild | no |

## 5d. Preprocessing comparison on held-out data (deployed model)

| Data | Preprocessing | Sensitivity | Specificity | AUC |
|---|---|---|---|---|
| test | resize | 92.4% | 89.8% | 0.974 |
| test | crop | 93.7% | 89.8% | 0.972 |
| validation | resize | 96.9% | 91.4% | 0.989 |
| validation | crop | 96.9% | 89.6% | 0.986 |

## 6. Data-leakage audit

- Images audited: 3662. Exact duplicate pairs: 134; duplicate or near-duplicate pairs in total: 1614.
- **Test images with a duplicate in the training or validation data: 75 of 548 (13.7%).**
- Validation images with a duplicate in training: 66 of 550.
- Duplicate pairs whose labels *disagree* (same image, different label): 44.
