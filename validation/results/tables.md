## 1. Previous model: which preprocessing reproduces its stored test results?

The previous (224 px) model's own record (`stage3Results`, test split, threshold 0.2): TP 206, TN 292, FP 33, FN 17.

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

## 2. Held-out performance of the deployed model (full-resolution photographs)

Referable = moderate NPDR or worse. Operating point: referable probability >= 0.0964. 95% intervals: Wilson (rates), bootstrap (AUC, kappa).

| Data | n (referable) | Sensitivity | Specificity | AUC | Kappa (5-class) | 5-class accuracy |
|---|---|---|---|---|---|---|
| test (all) | 548 (223) | 96.9% (93.7%-98.5%) | 88.3% (84.4%-91.4%) | 0.977 (0.965-0.987) | 0.860 (0.824-0.890) | 79.4% (75.8%-82.6%) |
| test (excluding images duplicated in train/val) | 473 (194) | 96.4% (92.7%-98.2%) | 87.8% (83.5%-91.1%) | 0.974 (0.959-0.985) | 0.860 (0.821-0.894) | 79.9% (76.1%-83.3%) |
| validation | 550 (223) | 99.1% (96.8%-99.8%) | 88.7% (84.8%-91.7%) | 0.989 (0.983-0.994) | 0.916 (0.891-0.936) | 81.3% (77.8%-84.3%) |
| training sample (500) | 500 (197) | 100.0% (98.1%-100.0%) | 89.1% (85.1%-92.1%) | 0.998 (0.996-0.999) | 0.941 (0.918-0.961) | 89.6% (86.6%-92.0%) |

## 3. Per-grade behaviour on the test set (5-class argmax)

| True grade | n | Recognised as that grade |
|---|---|---|
| No_DR | 270 | 97% |
| Mild | 55 | 69% |
| Moderate | 150 | 61% |
| Severe | 29 | 62% |
| Proliferate_DR | 44 | 57% |

Misses (referable images called non-referable) by true grade at the deployed threshold:

| True grade | Referable images | Missed |
|---|---|---|
| Moderate | 150 | 6 |
| Severe | 29 | 0 |
| Proliferate_DR | 44 | 1 |

## 4. Threshold behaviour (deployed model and pipeline)

| Threshold | Val sens | Val spec | Test sens | Test spec |
|---|---|---|---|---|
| 0.05 | 99.6% | 85.6% | 98.2% | 87.4% |
| 0.0964 (deployed) | 99.1% | 88.7% | 96.9% | 88.3% |
| 0.15 | 98.2% | 89.3% | 96.0% | 90.2% |
| 0.2 | 97.3% | 91.1% | 95.5% | 91.1% |
| 0.25 | 96.4% | 93.3% | 94.6% | 92.0% |
| 0.3 | 96.4% | 94.2% | 93.3% | 92.6% |
| 0.4 | 93.3% | 95.1% | 91.9% | 92.9% |
| 0.5 | 90.6% | 96.0% | 89.2% | 95.7% |
| 0.6 | 87.4% | 96.9% | 87.9% | 95.7% |
| 0.7 | 83.4% | 97.6% | 82.5% | 96.9% |

Thresholds chosen using the **validation** set only, then applied unchanged to the **test** set (the honest way to set an operating point):

| Rule (chosen on validation) | Threshold | Test sensitivity | Test specificity |
|---|---|---|---|
| highest threshold with validation sensitivity >= 99% | 0.09 | 96.9% (93.7%-98.5%) | 88.3% (84.4%-91.4%) |
| highest threshold with validation sensitivity >= 90% | 0.54 | 88.8% (84.0%-92.3%) | 95.7% (92.9%-97.4%) |
| highest threshold with validation sensitivity >= 95% | 0.31 | 93.3% (89.2%-95.9%) | 92.6% (89.2%-95.0%) |
| maximum Youden J on validation | 0.30 | 93.3% (89.2%-95.9%) | 92.6% (89.2%-95.0%) |

## 5. What the numbers mean in a real screening population

APTOS is enriched with disease: about 41% of these images are referable. In a general diabetic screening clinic the share is far lower, which changes what a positive result means (positive/negative predictive value).

Using the leakage-adjusted test sensitivity (96.4%) and specificity (87.8%):

| Referable prevalence in the screened population | Positive predictive value | Negative predictive value | Of 1,000 patients: flagged | of which truly referable |
|---|---|---|---|---|
| 41% | 84.6% | 97.2% | 467 | 395 |
| 20% | 66.4% | 99.0% | 290 | 193 |
| 10% | 46.8% | 99.5% | 206 | 96 |
| 5% | 29.4% | 99.8% | 164 | 48 |

## 5b. Decision rule: most-likely grade vs the tuned referable-probability threshold

The model was tuned to flag an eye as referable when the summed probability of Moderate, Severe and Proliferate is at least 0.0964 (the 'high sensitivity' operating point). Deciding instead from the single most-likely grade (argmax) ignores that tuning.

| Rule (test set) | Referable found | Referable missed | False alarms | Sensitivity | Specificity |
|---|---|---|---|---|---|
| most-likely grade (argmax) | 199 | 24 | 13 | 89.2% (84.5%-92.7%) | 96.0% (93.3%-97.6%) |
| referable probability >= 0.0964 | 216 | 7 | 38 | 96.9% (93.7%-98.5%) | 88.3% (84.4%-91.4%) |

## 5c. Full confusion matrix (test set, rows = true grade, columns = most-likely grade)

| True / Predicted | No_DR | Mild | Moderate | Severe | Proliferate_DR |
|---|---|---|---|---|---|
| No_DR | 263 | 5 | 1 | 1 | 0 |
| Mild | 6 | 38 | 7 | 0 | 4 |
| Moderate | 5 | 14 | 91 | 25 | 15 |
| Severe | 0 | 0 | 5 | 18 | 6 |
| Proliferate_DR | 0 | 5 | 6 | 8 | 25 |

Severe or Proliferate images NOT flagged at the deployed threshold:

| Image | True grade | Referable probability | Most likely grade | Has duplicate in train/val |
|---|---|---|---|---|
| eaa0dfbd5024 | Proliferate_DR | 0.03 | Mild | no |

## 5d. Previous model: preprocessing comparison on held-out data (`cropmirror` is what the app ran; `resize` is what that network was trained with)

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


## 7. Deployed model vs the previous model (full-resolution photographs, each at its own threshold)

The previous model was trained only on 224 px APTOS copies; given the full-resolution photographs a clinic uploads, its specificity is lower than on those copies. IDRiD: the official test set (103 photographs). The deployed model trained on IDRiD's training set, so IDRiD test is held out but not an unseen camera for it; for the previous model it is fully external.

| Data | Model | Threshold | Sensitivity | Specificity | AUC |
|---|---|---|---|---|---|
| APTOS test | previous | 0.2 | 97.8% (94.9%-99.0%) | 83.7% (79.3%-87.3%) | 0.974 (0.962-0.984) |
| APTOS test | deployed | 0.0964 | 96.9% (93.7%-98.5%) | 88.3% (84.4%-91.4%) | 0.977 (0.965-0.987) |
| IDRiD test | previous | 0.2 | 92.2% (83.0%-96.6%) | 30.8% (18.6%-46.4%) | 0.867 (0.790-0.934) |
| IDRiD test | deployed | 0.0964 | 90.6% (81.0%-95.6%) | 53.8% (38.6%-68.4%) | 0.922 (0.861-0.968) |