# Site calibration example: IDRiD as the new site

The site's graded sample is IDRiD's validation split (61 photographs, 38 referable), which the model did not train on. Each threshold below is chosen on that sample alone with `calibration/core.py` `choose_threshold`, then measured once on IDRiD's official test set (103 photographs, 64 referable). The deployed threshold is 0.0964.

| Rule (chosen on the site sample) | Threshold | Site sample sens / spec | **IDRiD test sensitivity** | **IDRiD test specificity** | Test photographs flagged |
|---|---|---|---|---|---|
| deployed model threshold (no site calibration) | 0.0964 | 100.0% / 82.6% | 90.6% (81%-96%) | 53.8% (39%-68%) | 74% |
| site sensitivity estimate >= 95% | 0.26 | 97.4% / 82.6% | 89.1% (79%-95%) | 74.4% (59%-85%) | 65% |
| site sensitivity 95% lower bound >= 95% | none | not reachable with 38 referable photographs | | | |
| site sensitivity estimate >= 90% | 0.57 | 92.1% / 87.0% | 82.8% (72%-90%) | 94.9% (83%-99%) | 53% |
| site sensitivity 95% lower bound >= 90% | 0.25 | 100.0% / 82.6% | 89.1% (79%-95%) | 74.4% (59%-85%) | 65% |

**Reading this.** A threshold chosen on the site's own photographs raises IDRiD specificity well above the deployed threshold's, at some cost in sensitivity. The site sample is small, so the intervals are wide and the *lower bound* rules (what the tool recommends by default) are more conservative. Which rule to adopt is the site clinical lead's decision; the tool never picks one. The specificity target (85%) is still not reached on IDRiD at a sensitivity above 90%: the model separates IDRiD's classes less well (AUC 0.92 against 0.98 on APTOS), which a threshold cannot fix. More training data from the site's camera would.
