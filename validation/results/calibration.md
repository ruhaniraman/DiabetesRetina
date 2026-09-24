# Stage 3 confidence calibration (deployed model)

Temperature T = 1.217, fitted on the validation split and applied unchanged here (held-out test sets). T > 1 means the raw network is over-confident. The referral decision is unaffected: it is made on the raw referral score at the threshold 0.0964 chosen on validation. What changes is the confidence the app reports (the band).

## APTOS test (548 photographs)

| Probabilities | ECE (lower is better) | Log loss | Mean confidence | Exact stage right |
|---|---|---|---|---|
| raw | 0.047 | 0.585 | 83.7% | 79.4% |
| calibrated | 0.037 | 0.559 | 80.8% | 79.4% |

Confidence bands with calibrated probabilities (what the app shows):

| Band | Photographs | Claims (mean) | Exact stage right | Referral decision wrong |
|---|---|---|---|---|
| High | 270 | 99% | 98% | 0.7% |
| Moderate | 96 | 80% | 71% | 19.8% |
| Low | 182 | 55% | 56% | 13.2% |

## IDRiD test (103 photographs)

| Probabilities | ECE (lower is better) | Log loss | Mean confidence | Exact stage right |
|---|---|---|---|---|
| raw | 0.145 | 1.202 | 69.8% | 55.3% |
| calibrated | 0.118 | 1.120 | 65.7% | 55.3% |

Confidence bands with calibrated probabilities (what the app shows):

| Band | Photographs | Claims (mean) | Exact stage right | Referral decision wrong |
|---|---|---|---|---|
| High | 14 | 96% | 79% | 7.1% |
| Moderate | 27 | 79% | 81% | 7.4% |
| Low | 62 | 53% | 39% | 33.9% |

Reliability diagram: `calibration_reliability.png` (points on the diagonal = confidence matches accuracy).
