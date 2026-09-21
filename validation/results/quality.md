## E. External validation on IDRiD (full-resolution images the model never saw)

516 photographs (4288 x 2848) with expert DR grades, read exactly as the app receives them. Referral threshold 0.2. 'app' = MATLAB resize to 224 (what the app does); 'area' = OpenCV area-averaged to 224 first.

| Data | n (referable) | Sensitivity | Specificity | AUC | Kappa (5-class) | 5-class accuracy |
|---|---|---|---|---|---|---|
| APTOS test (for reference) | 548 (223) | 92.4% (88.1%-95.2%) | 89.8% (86.1%-92.7%) | 0.974 (0.963-0.984) | 0.834 (0.799-0.868) | 77.7% (74.1%-81.0%) |
| IDRiD, variant 'app' | 516 (323) | 94.4% (91.4%-96.4%) | 46.1% (39.2%-53.2%) | 0.900 (0.875-0.924) | 0.612 (0.549-0.665) | 49.2% (44.9%-53.5%) |
| IDRiD, variant 'area' | 516 (323) | 92.3% (88.8%-94.7%) | 48.2% (41.2%-55.2%) | 0.857 (0.825-0.888) | 0.532 (0.466-0.592) | 43.6% (39.4%-47.9%) |

Per-grade recognition on IDRiD ('app'): No_DR 49% (n=168), Mild 12% (n=25), Moderate 75% (n=168), Severe 14% (n=93), Proliferate_DR 47% (n=62).

Referable found: threshold rule 305 of 323 (94.4%); most-likely-grade rule 296 (91.6%).

## 1. The previous gate

Rule: reject if the Laplacian variance of the whole grey image is below 12; flag 'poorly lit' if its mean is below 45 or above 210. APTOS files are already 224 px; IDRiD files are 12 megapixels, so the same rule behaves very differently on them.

| Data | Images | Reject | 'Poor lighting' | Accept | Median Laplacian variance | Median grey mean |
|---|---|---|---|---|---|---|
| APTOS (224 px files) | 3662 | 0.0% | 14.3% | 85.7% | 286 | 68 |
| IDRiD (12 MP files) | 516 | 10.1% | 5.4% | 84.5% | 23 | 68 |

Does the old gate's 'poor lighting' flag point at images the classifier gets wrong? (APTOS validation+test, and IDRiD)

| Data | Flagged | Referral decision wrong when flagged | when not flagged |
|---|---|---|---|
| APTOS | 145 of 1091 | 2.1% | 8.6% |
| IDRiD | 80 of 516 | 41.2% | 28.2% |

## 2. Do the quality measures predict where the classifier fails? (natural images)

AUC of each measure for spotting images whose referral decision is wrong (0.5 = no information; the direction that works best is shown). Classifier errors also come from genuinely ambiguous disease, so even a perfect quality measure would not reach 1.0.

| Measure | APTOS val+test AUC (direction) | IDRiD AUC (direction) |
|---|---|---|
| brightness | 0.581 (lower = worse) | 0.537 (lower = worse) |
| under_fraction | 0.563 (lower = worse) | 0.577 (higher = worse) |
| over_fraction | 0.608 (lower = worse) | 0.526 (lower = worse) |
| contrast | 0.642 (lower = worse) | 0.551 (lower = worse) |
| range_p5_p95 | 0.617 (lower = worse) | 0.542 (lower = worse) |
| lap_var | 0.627 (lower = worse) | 0.552 (lower = worse) |
| lap_var_norm | 0.528 (higher = worse) | 0.529 (lower = worse) |
| tenengrad_norm | 0.520 (higher = worse) | 0.568 (lower = worse) |
| hf_ratio | 0.535 (higher = worse) | 0.567 (higher = worse) |
| fov_fraction | 0.640 (higher = worse) | 0.517 (higher = worse) |
| cur_lap_native | 0.543 (lower = worse) | 0.575 (lower = worse) |
| cur_mean_native | 0.539 (higher = worse) | 0.530 (lower = worse) |

## 3. Controlled degradations (150 held-out APTOS test images, 30 per grade)

Each degradation is applied to the 224x224 image the classifier sees. 'Damage' compares the classifier on the same 150 images before and after.

| Condition | Sensitivity | Specificity | AUC | Sensitivity change | Old gate: rejected / flagged | Median sharpness (lap_var_norm) | Median brightness |
|---|---|---|---|---|---|---|---|
| clean | 94.4% | 81.7% | 0.968 | +0.0 pts | 0% / 13% | 0.698 | 0.281 |
| blur 0.5 | 97.8% | 73.3% | 0.970 | +3.4 pts | 0% / 13% | 0.271 | 0.281 |
| blur 1 | 98.9% | 36.7% | 0.969 | +4.5 pts | 38% / 1% | 0.038 | 0.279 |
| blur 1.5 | 98.9% | 25.0% | 0.957 | +4.5 pts | 99% / 0% | 0.018 | 0.278 |
| blur 2 | 98.9% | 15.0% | 0.942 | +4.5 pts | 100% / 0% | 0.012 | 0.276 |
| blur 3 | 100.0% | 8.3% | 0.874 | +5.6 pts | 100% / 0% | 0.010 | 0.273 |
| blur 4 | 100.0% | 5.0% | 0.838 | +5.6 pts | 100% / 0% | 0.009 | 0.271 |
| darken x0.7 | 93.3% | 80.0% | 0.956 | -1.1 pts | 0% / 42% | 0.722 | 0.195 |
| darken x0.5 | 93.3% | 78.3% | 0.948 | -1.1 pts | 2% / 89% | 0.730 | 0.140 |
| darken x0.35 | 95.5% | 63.3% | 0.931 | +1.1 pts | 11% / 89% | 0.804 | 0.097 |
| darken x0.25 | 96.6% | 51.7% | 0.897 | +2.2 pts | 26% / 74% | nan | nan |
| darken x0.15 | 98.9% | 20.0% | 0.824 | +4.5 pts | 91% / 9% | nan | nan |
| brighten x1.5 | 95.5% | 85.0% | 0.973 | +1.1 pts | 0% / 1% | 0.722 | 0.417 |
| brighten x2 | 92.1% | 81.7% | 0.956 | -2.2 pts | 0% / 1% | 0.750 | 0.556 |
| brighten x3 | 94.4% | 45.0% | 0.866 | +0.0 pts | 0% / 1% | 1.092 | 0.802 |
| noise 10 | 96.6% | 53.3% | 0.931 | +2.2 pts | 0% / 12% | 6.855 | 0.269 |
| noise 20 | 98.9% | 15.0% | 0.811 | +4.5 pts | 0% / 12% | 5.885 | 0.222 |
| noise 40 | 95.5% | 5.0% | 0.565 | +1.1 pts | 0% / 5% | 13.011 | 0.231 |
| jpeg q40 | 100.0% | 5.0% | 0.907 | +5.6 pts | 1% / 13% | 0.201 | 0.280 |
| jpeg q20 | 100.0% | 0.0% | 0.830 | +5.6 pts | 0% / 13% | 0.196 | 0.279 |
| jpeg q10 | 100.0% | 0.0% | 0.692 | +5.6 pts | 0% / 13% | 0.199 | 0.277 |

## 4. The shipped gate (`backend/quality.py`)

Verdicts: **reject** (ask for a new photo), **warn** (accept, but results may be less reliable), **accept**.

| Data | Images | Reject | Warn | Accept |
|---|---|---|---|---|

| APTOS (all) | 3662 | 0.1% | 1.6% | 98.3% |
| IDRiD | 516 | 1.0% | 5.4% | 93.6% |

Classifier errors, by what the gate said (natural images):

| Data | Verdict | Images | Referral decision wrong | Referable cases missed |
|---|---|---|---|---|
| APTOS val+test | reject | 1 | 0.0% | 0 of 0 |
| APTOS val+test | warn | 17 | 11.8% | 1 of 11 |
| APTOS val+test | accept | 1073 | 7.6% | 23 of 434 |
| IDRiD | reject | 5 | 20.0% | 1 of 4 |
| IDRiD | warn | 28 | 25.0% | 0 of 16 |
| IDRiD | accept | 483 | 30.6% | 19 of 266 |

How the shipped gate treats each degradation (share of the 150 images per verdict), beside the damage to the classifier:

| Condition | Sensitivity change | AUC | Reject | Warn | Accept |
|---|---|---|---|---|---|
| clean | +0.0 pts | 0.968 | 1% | 1% | 98% |
| blur 0.5 | +3.4 pts | 0.970 | 1% | 6% | 93% |
| blur 1 | +4.5 pts | 0.969 | 34% | 64% | 2% |
| blur 1.5 | +4.5 pts | 0.957 | 90% | 10% | 0% |
| blur 2 | +4.5 pts | 0.942 | 97% | 3% | 0% |
| blur 3 | +5.6 pts | 0.874 | 99% | 1% | 0% |
| blur 4 | +5.6 pts | 0.838 | 99% | 1% | 0% |
| darken x0.7 | -1.1 pts | 0.956 | 3% | 11% | 86% |
| darken x0.5 | -1.1 pts | 0.948 | 16% | 25% | 59% |
| darken x0.35 | +1.1 pts | 0.931 | 52% | 36% | 12% |
| darken x0.25 | +2.2 pts | 0.897 | 92% | 8% | 0% |
| darken x0.15 | +4.5 pts | 0.824 | 100% | 0% | 0% |
| brighten x1.5 | +1.1 pts | 0.973 | 1% | 14% | 85% |
| brighten x2 | -2.2 pts | 0.956 | 20% | 32% | 48% |
| brighten x3 | +0.0 pts | 0.866 | 73% | 10% | 17% |
| noise 10 | +2.2 pts | 0.931 | 97% | 0% | 3% |
| noise 20 | +4.5 pts | 0.811 | 99% | 0% | 1% |
| noise 40 | +1.1 pts | 0.565 | 100% | 0% | 0% |
| jpeg q40 | +5.6 pts | 0.907 | 1% | 11% | 88% |
| jpeg q20 | +5.6 pts | 0.830 | 1% | 11% | 87% |
| jpeg q10 | +5.6 pts | 0.692 | 1% | 7% | 92% |

## 5. Why IDRiD is over-referred: how much detail survives the shrink to 224 px

Hypothesis: shrunk to 224 px, IDRiD photographs carry less fine detail than the APTOS images the classifier was trained on, and blurred images are over-referred (section 3). Test: shrink the same 516 photographs in ways that keep more detail and see whether specificity recovers. **Diagnostic only; the app is unchanged.**

For scale, APTOS training images have median sharpness 0.69. Split rows separate the 413 IDRiD training images from the 103 test images.

| Shrink method | Median sharpness | Sensitivity | Specificity | AUC | Specificity, IDRiD train (413) | Specificity, IDRiD test (103) |
|---|---|---|---|---|---|---|
| app (MATLAB bicubic, what the app does) |  | 94.4% | 46.1% | 0.900 | 55.3% | 12.2% |
| area | 0.21 | 91.9% | 48.7% | 0.874 | 57.9% | 12.8% |
| lanczos | 0.87 | 74.3% | 71.7% | 0.836 | 76.3% | 53.8% |
| linear_noAA | 0.77 | 75.2% | 72.3% | 0.840 | 77.6% | 51.3% |
| nearest | 0.88 | 73.9% | 76.4% | 0.843 | 80.3% | 61.5% |
| area_unsharp | 0.67 | 86.5% | 61.3% | 0.861 | 69.1% | 30.8% |
| area_unsharp_strong | 1.32 | 80.2% | 69.1% | 0.854 | 75.7% | 43.6% |

## 6. Heavy JPEG compression at full resolution (120 IDRiD photographs)

Section 3 compressed *after* shrinking to 224 px, which is harsher than reality: an upload is compressed at full size and then shrunk, which averages the artifacts away. Here JPEG is applied at native resolution first.

| Version | Sensitivity | Specificity | AUC | Same referral decision as uncompressed |
|---|---|---|---|---|
| no extra compression | 88.9% | 44.7% | 0.829 | 100% |
| JPEG quality 60 at full size | 88.9% | 36.2% | 0.818 | 95% |
| JPEG quality 20 at full size | 92.1% | 48.9% | 0.819 | 93% |
