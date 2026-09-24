## A. Overlap with annotated lesions (IDRiD, pixel-level ground truth)

Precision = share of drawn pixels that lie on a real lesion. Chance = precision of a random guess (the lesion share of the retina). Lesion sensitivity = share of annotated lesions the overlay touches. Region precision = share of drawn regions sitting on a real lesion (3 px tolerance).

**all 81 images**

| Overlay label | Pixel precision | Chance | Pixel recall | Dice | Lesion sensitivity | Region precision | Regions drawn per true lesion |
|---|---|---|---|---|---|---|---|
| exudates | 35.0% | 1.3% | 4.3% | 0.077 | 2.7% of 11642 | 39.4% | 0.1 |
| hemorrhages | 0.0% | 1.5% | 0.0% | 0.000 | 0.0% of 1900 | 0.0% | 0.0 |
| microaneurysms | 0.0% | 0.1% | 0.0% | 0.000 | 0.0% of 3497 | 0.0% | 0.0 |

**test set (27)**

| Overlay label | Pixel precision | Chance | Pixel recall | Dice | Lesion sensitivity | Region precision | Regions drawn per true lesion |
|---|---|---|---|---|---|---|---|
| exudates | 38.9% | 1.6% | 3.1% | 0.057 | 2.3% of 4116 | 42.2% | 0.1 |
| hemorrhages | 0.0% | 1.5% | 0.0% | 0.000 | 0.0% of 535 | 0.0% | 0.0 |
| microaneurysms | 0.0% | 0.1% | 0.0% | 0.000 | 0.0% of 1085 | 0.0% | 0.0 |

## B. What the overlay draws on healthy vs diseased eyes (APTOS test images)

248 images, evenly sampled across true grades. Numbers are the median (10th-90th percentile) count of drawn regions per image.

| True grade | n | Microaneurysm-like | Hemorrhage-like | Exudate-like | All regions | Share of retina painted |
|---|---|---|---|---|---|---|
| No_DR | 60 | 114 (40-151) | 18 (9-26) | 12 (4-24) | 149 (58-188) | 2.6% |
| Mild | 55 | 110 (81-131) | 19 (14-26) | 16 (11-28) | 149 (112-172) | 2.8% |
| Moderate | 60 | 99 (78-139) | 19 (14-27) | 19 (7-29) | 140 (110-177) | 2.7% |
| Severe | 29 | 104 (58-146) | 24 (16-34) | 18 (10-33) | 153 (90-186) | 2.8% |
| Proliferate_DR | 44 | 106 (82-145) | 23 (17-31) | 17 (8-31) | 156 (118-194) | 2.7% |

How well does the number of drawn regions tell referable from non-referable eyes? (AUC; 0.5 = no information)

| Count used | AUC |
|---|---|
| microaneurysms | 0.470 |
| hemorrhages | 0.625 |
| exudates | 0.636 |
| total | 0.512 |

Healthy (No_DR) eyes with at least one drawn region: **100%** (median 149 regions).
