# Stage 1 image-quality gate: validation and redesign

**What it is:** the check that runs when a photo is uploaded and decides whether it is fit to grade (`backend/quality.py`).
**Outcome:** the previous gate was a naive port of the team's MATLAB Stage 1 and did not work on real uploads. It has been replaced by a
calibrated one. Evidence below; full tables in [`results/quality.md`](results/quality.md).

## What was wrong with the previous gate

| Problem | Effect |
|---|---|
| Brightness was the mean of the **whole frame**, black border included | 14.3% of APTOS photographs were flagged "poorly lit" simply because they have a wide black border. On those it was slightly *anti*-predictive: 2.1% of flagged images had a wrong referral decision, against 8.6% of the rest. |
| Blur was the **raw Laplacian variance at native resolution** (reject below 12) | It depends on file size. APTOS files here are 224 px (never rejected); IDRiD files are 12 megapixels, where **10.1%** of good photographs were rejected as "too blurry". |
| Thresholds (12 / 45 / 210) were **never calibrated** | The MATLAB original had calibrated thresholds and a note to re-calibrate for other cameras; the port kept neither. |
| It told users "**contrast enhancement will be applied**" | Nothing applied it. The claim was false. (It also could not be true safely: the classifier was validated on unprocessed images.) |

## Method

There are no quality labels in APTOS or IDRiD, so the gate was validated by what matters: **does it stop images the classifier cannot handle?**

1. **Measures on the model's own view.** Every measure is computed on the 224 x 224 image the classifier sees, on the green channel, inside the retina only. That makes a 224 px file and a 12 MP upload directly comparable, and ignores blur that disappears when the photo is shrunk.
2. **Natural images.** 3,662 APTOS + 516 IDRiD photographs: how measures are distributed, and whether they predict classifier errors.
3. **Controlled degradations.** 150 held-out APTOS test images (30 per grade), degraded 20 ways (blur, darkening, brightening, noise, JPEG), each scored by the classifier and by the gate.
4. **Thresholds** were chosen from (2) and (3): *reject* only where a degradation seriously damages the classifier **and** natural photographs almost never fall; *warn* in the band between. (The degradation images come from the test split, so the natural-image results and the IDRiD results are the independent checks.)

## Findings

**1. Bad photos make the classifier over-refer; they do not make it miss disease.** Blur, noise and heavy darkening leave sensitivity at 93-100% but destroy specificity:

| Degradation (on the 224 px image) | Specificity (clean: 81.7%) | Gate: rejected / warned |
|---|---|---|
| blur sigma 0.5 px | 73.3% | 1% / 6% |
| blur sigma 1 px | 36.7% | 34% / 64% |
| blur sigma 2 px | 15.0% | 97% / 3% |
| darken x0.5 | 78.3% | 16% / 25% |
| darken x0.35 | 63.3% | 52% / 36% |
| brighten x3 | 45.0% | 73% / 10% |
| noise sigma 10 | 53.3% | 97% / 0% |

That is the safe direction for a screening tool, but it means a poor photo produces a false referral. The gate exists to prevent that.

**2. On natural images the new gate is quiet.** It rejects **0.1%** of APTOS and **1.0%** of IDRiD photographs and warns on 1.6% and 5.4% (the previous gate flagged 14.3% of APTOS and rejected 10.1% of IDRiD).

**3. Natural photo quality explains little of the classifier's errors.** No measure predicts a wrong referral decision well (AUC 0.52-0.64 on APTOS, 0.52-0.58 on IDRiD; 0.5 is no information). Errors come mostly from ambiguous disease and from differences between datasets, not from photo quality. So the gate does **not** pretend to predict errors: it screens out clearly ungradable photos. In the natural data, images the gate warned about were not clearly worse (APTOS: 11.8% wrong when warned vs 7.6% accepted, 17 images).

**4. Heavy JPEG compression is not a practical risk, so the gate does not check for it.** Compressing *after* shrinking to 224 px looked catastrophic (specificity 5%) and the gate could not see it. But an upload is compressed at full size first. Applied at full resolution to 120 IDRiD photographs, JPEG quality 20 changed the referral decision for only 7% of images (quality 60: 5%).

## A larger finding: the classifier does not transfer to another dataset well

Not part of the gate, but discovered while validating it (`validation/external_idrid.py`). On **IDRiD** (516 full-resolution photographs with expert grades; the model never saw them), at the deployed threshold:

| | Sensitivity | Specificity | AUC | Kappa |
|---|---|---|---|---|
| APTOS test (its own data) | 92.4% | 89.8% | 0.974 | 0.834 |
| **IDRiD** (external) | **94.4%** (91.4-96.4) | **46.1%** (39.2-53.2) | 0.900 | 0.612 |

It still finds referable disease, but it calls more than half of the healthy IDRiD eyes referable (only 49% of healthy eyes recognised as healthy; Mild recognised 12% of the time). In a real clinic with low disease prevalence that would mean a very large number of false referrals. This is the concrete version of the warning in `REPORT.md`: **performance depends on the camera and population, and must be re-measured on your own images.**

I tested one explanation: IDRiD photographs shrunk to 224 px have far less fine detail than APTOS's (median sharpness 0.21 vs 0.69), and blurred images are over-referred. Shrinking IDRiD in ways that restore that detail does raise specificity (to 72-76%), **but sensitivity falls from 94% to about 74% and AUC drops from 0.90 to about 0.84**. It moves the operating point rather than fixing discrimination, so the app's preprocessing was left unchanged. (IDRiD's official test subset alone gives 12% specificity on only 34 healthy eyes, a reminder of how noisy small sets are.)

## The new gate (`backend/quality.py`)

| Check (on the 224 px view, retina only) | Warn | Reject |
|---|---|---|
| No retina found | | yes |
| Sharpness (contrast-normalised Laplacian variance) | below 0.08 | below 0.03 |
| Retina brightness, too dark | below 0.13 | below 0.10 |
| Retina brightness, too bright | above 0.55 | above 0.70, or over 10% saturated |
| Fine-detail ratio (grain, compression noise) | | above 0.55 |

Rejected photos get a specific message asking for a retake; warned photos are accepted with "results may be less reliable". **Nothing is ever
enhanced or altered.** The thresholds are calibrated on APTOS and IDRiD only: on another camera they must be re-checked (`python validation/analyze_quality.py`).

## Limits

- Calibrated on two datasets (mostly one camera type in each). Other cameras, phone-based fundus adapters and different fields of view may need other thresholds.
- Quality labels do not exist, so "would a clinician call this ungradable?" was not measured. The gate is validated against classifier behaviour, not clinical gradability.
- It does not detect a wrong-eye or non-fundus image beyond "no retina found", nor a dilated/undilated pupil, media opacity, or artefacts such as eyelashes.
- Degradations were synthetic. Real capture problems (motion blur, uneven illumination, partial occlusion) are not covered.

## Reproduce

| Step | Command | Needs |
|---|---|---|
| External validation on IDRiD | `python validation/external_idrid.py` | MATLAB, `data/idrid_grading` (about 30 min) |
| Quality measures for every image | `python validation/quality_metrics.py` | both datasets (about 5 min) |
| Controlled degradations | `python validation/degradation_experiment.py` | MATLAB (about 10 min) |
| Shrinking / JPEG diagnostics | `python validation/downscale_experiment.py`, then `python validation/downscale_sharpness.py` | MATLAB, IDRiD |
| Analyse | `python validation/analyze_quality.py` | committed `results/` only |
