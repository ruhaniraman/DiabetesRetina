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
| test (all) | 548 (223) | 95.1% (91.4%-97.2%) | 89.2% (85.4%-92.2%) | 0.977 (0.966-0.986) | 0.837 (0.798-0.873) | 78.1% (74.5%-81.4%) |
| test (excluding images duplicated in train/val) | 473 (194) | 94.3% (90.1%-96.8%) | 88.9% (84.7%-92.1%) | 0.973 (0.960-0.984) | 0.832 (0.787-0.871) | 77.8% (73.8%-81.3%) |
| validation | 550 (223) | 99.1% (96.8%-99.8%) | 89.3% (85.5%-92.2%) | 0.990 (0.983-0.995) | 0.875 (0.844-0.902) | 79.5% (75.9%-82.6%) |
| training sample (500) | 500 (197) | 99.0% (96.4%-99.7%) | 91.1% (87.3%-93.8%) | 0.993 (0.988-0.997) | 0.901 (0.868-0.929) | 85.8% (82.5%-88.6%) |

## 3. Per-grade behaviour on the test set (5-class argmax)

| True grade | n | Recognised as that grade |
|---|---|---|
| No_DR | 270 | 98% |
| Mild | 55 | 67% |
| Moderate | 150 | 60% |
| Severe | 29 | 52% |
| Proliferate_DR | 44 | 48% |

Misses (referable images called non-referable) by true grade at the deployed threshold:

| True grade | Referable images | Missed |
|---|---|---|
| Moderate | 150 | 10 |
| Severe | 29 | 0 |
| Proliferate_DR | 44 | 1 |

## 4. Threshold behaviour (deployed model and pipeline)

| Threshold | Val sens | Val spec | Test sens | Test spec |
|---|---|---|---|---|
| 0.05 | 100.0% | 76.8% | 98.2% | 80.9% |
| 0.10 | 99.6% | 82.6% | 97.3% | 86.8% |
| 0.15 | 99.1% | 85.9% | 96.4% | 88.3% |
| 0.20 (deployed) | 99.1% | 89.3% | 95.1% | 89.2% |
| 0.25 | 97.8% | 91.1% | 94.6% | 90.5% |
| 0.30 | 95.1% | 94.2% | 92.4% | 92.3% |
| 0.40 | 91.0% | 95.4% | 88.3% | 93.8% |
| 0.50 | 87.9% | 96.6% | 86.1% | 95.1% |
| 0.60 | 86.1% | 98.2% | 82.1% | 96.0% |
| 0.70 | 78.5% | 99.1% | 72.2% | 98.2% |

Thresholds chosen using the **validation** set only, then applied unchanged to the **test** set (the honest way to set an operating point):

| Rule (chosen on validation) | Threshold | Test sensitivity | Test specificity |
|---|---|---|---|
| highest threshold with validation sensitivity >= 90% | 0.43 | 87.4% (82.5%-91.2%) | 93.8% (90.7%-96.0%) |
| highest threshold with validation sensitivity >= 95% | 0.31 | 92.4% (88.1%-95.2%) | 92.6% (89.2%-95.0%) |
| maximum Youden J on validation | 0.27 | 94.2% (90.3%-96.6%) | 91.4% (87.8%-94.0%) |

## 5. What the numbers mean in a real screening population

APTOS is enriched with disease: about 41% of these images are referable. In a general diabetic screening clinic the share is far lower, which changes what a positive result means (positive/negative predictive value).

Using the leakage-adjusted test sensitivity (94.3%) and specificity (88.9%):

| Referable prevalence in the screened population | Positive predictive value | Negative predictive value | Of 1,000 patients: flagged | of which truly referable |
|---|---|---|---|---|
| 41% | 85.5% | 95.8% | 452 | 387 |
| 20% | 68.0% | 98.4% | 278 | 189 |
| 10% | 48.5% | 99.3% | 194 | 94 |
| 5% | 30.9% | 99.7% | 153 | 47 |

## 5b. Decision rule: most-likely grade vs the tuned referable-probability threshold

The model was tuned to flag an eye as referable when the summed probability of Moderate, Severe and Proliferate is at least 0.2 (the 'high sensitivity' operating point). Deciding instead from the single most-likely grade (argmax) ignores that tuning.

| Rule (test set) | Referable found | Referable missed | False alarms | Sensitivity | Specificity |
|---|---|---|---|---|---|
| most-likely grade (argmax) | 183 | 40 | 13 | 82.1% (76.5%-86.5%) | 96.0% (93.3%-97.6%) |
| referable probability >= 0.2 | 212 | 11 | 35 | 95.1% (91.4%-97.2%) | 89.2% (85.4%-92.2%) |

## 5c. Full confusion matrix (test set, rows = true grade, columns = most-likely grade)

| True / Predicted | No_DR | Mild | Moderate | Severe | Proliferate_DR |
|---|---|---|---|---|---|
| No_DR | 265 | 3 | 1 | 0 | 1 |
| Mild | 7 | 37 | 9 | 0 | 2 |
| Moderate | 5 | 27 | 90 | 12 | 16 |
| Severe | 0 | 2 | 8 | 15 | 4 |
| Proliferate_DR | 0 | 6 | 10 | 7 | 21 |

Severe or Proliferate images NOT flagged at the deployed threshold:

| Image | True grade | Referable probability | Most likely grade | Has duplicate in train/val |
|---|---|---|---|---|
| eaa0dfbd5024 | Proliferate_DR | 0.04 | Mild | no |

## 5d. Preprocessing comparison on held-out data (`cropmirror` is what the app runs now; `resize` is what the network was trained with)

| Data | Preprocessing | Sensitivity | Specificity | AUC |
|---|---|---|---|---|
| test | resize | 92.4% | 89.8% | 0.974 |
| test | crop | 93.7% | 89.8% | 0.972 |
| test | cropmirror | 95.1% | 89.2% | 0.977 |
| validation | resize | 96.9% | 91.4% | 0.989 |
| validation | crop | 96.9% | 89.6% | 0.986 |
| validation | cropmirror | 99.1% | 89.3% | 0.990 |

## 6. Data-leakage audit

- Images audited: 3662. Exact duplicate pairs: 134; duplicate or near-duplicate pairs in total: 1614.
- **Test images with a duplicate in the training or validation data: 75 of 548 (13.7%).**
- Validation images with a duplicate in training: 66 of 550.
- Duplicate pairs whose labels *disagree* (same image, different label): 44.
