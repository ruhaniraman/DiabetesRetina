# Stage 2 lesion overlay: evaluation and decision

> **Retired on 2026-09-24.** The app's lesion overlay is now the trained U-Net in `stage2_structure/dl/` (possible lesions, calibrated so most healthy
> eyes stay clear; `results/lesions_dl_Stage2_LesionUNet_v2_calibrated.md`). This file is the evidence for retiring the heuristic below, whose code is
> kept in `validation/legacy_overlay.py` only so these numbers can be reproduced. Regenerated on 2026-09-24 after fixing the IDRiD mask reader
> (`IDRiD_81_EX.tif` is RGBA; the exudate rows changed slightly, the conclusion did not).

**What was evaluated:** `segment_lesions`, then in `backend/server.py`, the exact code behind the "Mapped" / "Lesion Overlay" views. It is
classical image processing (not the neural network) that paints candidate microaneurysms, haemorrhages and exudates on a fundus photo
and reports a count of each.

**Decision: it was switched off, and later replaced by the trained lesion network.** The evidence below shows it does not detect lesions.

## Evidence

Reproduce with `python validation/evaluate_lesions.py`; full tables are in [`results/lesions.md`](results/lesions.md).

### A. Does it find the real lesions? (IDRiD, 81 images with pixel-level expert annotations)

| Overlay label | Pixels drawn that lie on a real lesion | Chance level | Real lesions it touches |
|---|---|---|---|
| Hard exudates | 35.0% | 1.3% | **2.7%** of 11,642 |
| Haemorrhages | 0.0% | 1.5% | **0.0%** of 1,900 |
| Microaneurysms | 0.0% | 0.1% | **0.0%** of 3,497 |

The exudate pixels it does draw are far more often correct than chance (27 times), but it draws them for only 4.3% of the annotated exudate
area (Dice 0.077). For haemorrhages and microaneurysms **nothing it draws overlaps an annotated lesion at all** on these photographs.
(The test-set-only rows in `lesions.md` are similar.)

### B. Does it stay quiet on healthy eyes? (APTOS, 248 test images by true grade)

It does not. Each lesion type is found by taking the top 2%, 3% or 0.6% of pixels *within that image*, so something is drawn on
every retina by construction:

| True grade | Regions drawn (median, all types) | Share of retina painted |
|---|---|---|
| No DR (healthy) | **149** | 2.6% |
| Mild | 149 | 2.8% |
| Moderate | 140 | 2.7% |
| Severe | 153 | 2.8% |
| Proliferative | 156 | 2.7% |

- 100% of healthy eyes get regions drawn, a median of 149 per eye.
- The count cannot tell referable from non-referable eyes: AUC **0.51** (0.5 is no information); microaneurysm-like count 0.47
  (worse than chance), haemorrhage-like 0.63, exudate-like 0.64.

So the old report line "117 microaneurysm-like spots" on a healthy eye was noise, presented as a finding.

## Why not replace it?

- **The team's own MATLAB lesion detector** (`stage2_structure/lesionDetection.m`) is somewhat better on the team's 5-image benchmark
  (Dice about 0.20 for exudates and 0.16 for haemorrhages; 0.00 for microaneurysms, which they documented honestly). That is still weak,
  its behaviour on healthy eyes is unmeasured, and it needs the optic-disc and vessel stages running first.
- **A trained segmentation network** would need far more annotated data than the 81 IDRiD images (as the team's own documentation notes).

If you want to pursue this, the path is: evaluate the MATLAB detector with this same script's method (IDRiD ground truth plus healthy
APTOS eyes), and only expose a lesion type if it clears a bar a clinician sets. Until then the model's referral decision and the
Grad-CAM attention map (labelled as *where the model looked*, not a lesion detection) are the explainability the app offers.

## Limits of this evaluation

- IDRiD photographs are 4288 x 2848 pixels; the overlay's size limits scale with image size, so results depend on resolution. APTOS
  photographs are smaller, where it draws far more regions (Part B); both behaviours are problematic.
- IDRiD contains only diseased eyes, which is why Part B (healthy vs diseased) uses APTOS, which has image-level grades but no lesion masks.
- Region-level matching uses a 3-pixel tolerance; pixel-level Dice is strict for very small lesions such as microaneurysms.
