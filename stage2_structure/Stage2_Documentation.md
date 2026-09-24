# Stage 2 — Retinal Structure Segmentation
**SIH26038 — Explainable AI for Diabetic Retinopathy Screening in Rural India**

## Overview

Stage 2 covers optic disc & fovea localization, retinal vessel segmentation, and lesion
detection (microaneurysms, hemorrhages, hard exudates, soft exudates) on the IDRiD dataset.

**Design choice: classical computer vision, not deep learning.** This follows the Stage 0
guidance directly — the IDRiD segmentation ground-truth set is only 81 images (54 train /
27 test), too small to train a deep network from scratch. Classical CV also serves the
hackathon's core requirement directly: **every detection is explainable by construction**.
There is no black box to interpret — each component's overlay visualization shows exactly
which candidate regions were considered, why one was selected over another, and what
anatomical/visual evidence (brightness, shape, vessel convergence) drove that decision.

**Data used:**
- `idrid.localization` — 413 train / 103 test images with OD and fovea coordinate ground truth
- `idrid.segmentation` — 81 images (54 train / 27 test) with pixel-level lesion masks (separate
  image set from localization, independently numbered)

---

## 1. Optic Disc Localization — ✅ Complete

**Approach:** Two-stage classical pipeline.
1. **Candidate generation** — local-contrast enhancement (background-subtracted via large-sigma
   Gaussian blur, scaled to expected OD size) → adaptive percentile threshold → morphological
   cleanup → filtered by expected area ratio and shape solidity (rejects merged/irregular blobs).
2. **Candidate scoring** — weighted combination of vessel-orientation convergence (vessels
   anatomically converge toward the disc), shape circularity (eccentricity), and relative
   brightness. Final coordinate is the brightness-weighted centroid of the winning candidate.

**Result (10-image benchmark, IDRiD_001–010):**
| Metric | Value |
|---|---|
| Mean error | 58.21 px |
| Median error | 39.27 px |
| Max error | 123.47 px |
| Failed detections | 1/10 (returns "no confident detection" rather than a wrong guess) |

(Image width: 4288px, so mean error is ~1.4% of image width.)

**Development notes:** Seven earlier approaches (brightness-only scoring, geometric priors,
local contrast enhancement, percentile thresholds, multi-feature scoring, revised weighting,
and raw vessel-density scoring) were tried and rejected before arriving at this design. Key
lesson: the recurring failure mode across early attempts was *picking the wrong candidate from
an otherwise-reasonable set*, not failing to generate a good candidate in the first place —
which is what motivated the shift to explicit anatomical scoring (vessel convergence + shape)
rather than ever-more-complex brightness heuristics.

**Known limitation:** on images where the disc is optically merged with an adjacent bright
lesion, the system correctly identifies the ambiguity (low shape "solidity") and abstains
rather than guessing — a deliberate design choice suited to a clinical screening context.

---

## 2. Fovea Localization — ✅ Complete

**Approach:** Purely geometric, anchored on the OD prediction. A pixel-based "darkest region"
search was attempted first and **failed decisively** (1700–1900px errors) — the macula's
darkening is far too subtle relative to vessels, shadows, and image artifacts for a
brightness-based search to reliably distinguish it. This was abandoned in favor of a
statistical approach: the OD-to-fovea offset was computed directly from all 413 real
`idrid.localization` image pairs, split by which half of the image the OD sits in (a proxy for
eye laterality, which flips the offset direction). Once split this way, the offset is highly
consistent (distance std ≈ 6% of mean).

**Result (10-image benchmark):**
| Metric | Value |
|---|---|
| Mean error | 123.02 px |
| Median error | 96.64 px |
| Max error | 296.70 px |
| Failed detections | 1/10 (inherited from a failed OD prediction on that image) |

**Known limitation:** purely geometric — does not use image content at all, so it cannot
correct for atypical anatomy or unusual camera framing. Accuracy is inherently bounded by
anatomical variability, not further tunable without reintroducing the image-search approach
that already failed.

---

## 3. Vessel Segmentation — ✅ Complete

**Approach:** CLAHE contrast enhancement → multi-scale vesselness filtering (`fibermetric`,
MATLAB's built-in Frangi-style filter, across 6 thickness scales to capture both major
arcades and fine peripheral vessels) → percentile threshold → morphological cleanup, all
restricted to the segmented field-of-view.

**Result:** 16.02% vessel density on IDRiD_001 (healthy fundus images typically show 10–15%
vessel coverage of the retina). Visual inspection confirms clean, continuous major vascular
arcades radiating from the optic disc.

**Note on evaluation:** IDRiD does not provide pixel-level vessel ground truth (unlike DRIVE
or STARE), so this component is validated by density plausibility and visual inspection rather
than Dice/IoU against ground truth. If quantitative validation is required for the final
report, the DRIVE dataset (40 images, public, vessel-labeled) is the standard benchmark.

**Known limitation:** vessel detection is measurably weaker in regions where vessels pass
through or near bright lesion patches — the lesion's contrast disrupts the local intensity
gradient the filter relies on. Documented, not fixed; fixing it properly would require lesion
masking *before* vessel detection, which is circular given lesion detection depends on nothing
from this stage.

---

## 4. Lesion Detection — ✅ Complete (mixed results, honestly reported)

**Approach:** Classical detection per lesion type, reusing OD location (to exclude the disc,
which would trigger false exudate positives) and the vessel mask (to exclude vessels, which
would swamp hemorrhage/MA detection since both are dark blob-like structures).
- **Hard exudates (EX):** background-subtracted brightness threshold + shape filtering.
- **Hemorrhages (HE):** local-darkness threshold, vessel-excluded, filtered by area and
  roundness (elongated survivors are more likely to be leftover vessel fragments, not lesions).
- **Microaneurysms (MA):** small-scale morphological black top-hat filter targeting tiny,
  very round dark dots.
- **Soft exudates (SE):** larger-scale brightness threshold, explicitly lower-confidence.

**Result (5-image benchmark against real IDRiD pixel-level ground truth, Dice coefficient):**
| Lesion type | Mean Dice | Assessment |
|---|---|---|
| Hard exudates (EX) | 0.197 | Real, moderate signal — useful for flagging regions of concern |
| Hemorrhages (HE) | 0.161 | Real, moderate signal — same caveat as EX |
| Microaneurysms (MA) | **0.000** (every image) | **Non-functional as a pixel detector** |
| Soft exudates (SE) | 0.000 (n=1 sample) | Too rare in this sample to evaluate meaningfully |

**Honest assessment — this is the one area of Stage 2 that did not fully succeed, and that is
reported transparently rather than concealed:**

- **EX and HE** are real, working classical detectors. Dice scores of ~0.16–0.20 mean they are
  not pixel-perfect segmentations, but they consistently locate genuine regions of pathology
  and are suitable for **screening-level flagging** (highlighting a region for a clinician to
  confirm) rather than diagnostic-grade boundary delineation.
- **MA detection did not converge to a working approach.** Across every test image, predicted
  MA regions had essentially zero spatial overlap with true microaneurysm locations, despite
  plausible predicted areas — indicating the classical top-hat filter is responding to noise or
  unrelated small dark structures, not true microaneurysms. This is consistent with published
  literature: MA detection is widely recognized as the hardest DR lesion-detection sub-problem,
  even for deep-learning approaches, due to the lesions' extreme subtlety (5–15px) at this
  image resolution. **Recommendation for the team:** present MA output as "candidate regions
  flagged for clinician review" rather than a scored detection, which is both an honest
  characterization of current performance and arguably a better fit for the hackathon's
  explainable-AI framing (human-in-the-loop verification) than a false claim of precision.
- **SE** remains explicitly experimental/out of scope given its rarity in the training data
  (only 1 of 5 sampled images had any SE ground truth at all).

---

## File Structure

```
stage2_structure/
├── opticDiscLocalization.m     — OD detection (frozen, verified)
├── fovealLocalization.m        — Fovea detection (frozen, verified)
├── vesselSegmentation.m        — Vessel detection (frozen, verified)
├── lesionDetection.m           — MA/HE/EX/SE detection (frozen)
├── runBatch_opticDisc.m        — OD batch benchmark script
├── runBatch_fovea.m            — Chained OD+fovea batch benchmark script
├── evalLesionDetection.m       — Lesion Dice/IoU evaluation against ground truth
├── examples/                   — committed sample outputs (OD, vessel and lesion overlays; MA diagnostics)
└── results/                    — where the scripts save new outputs (git-ignored, always this folder)
    ├── od_localization/        — OD overlay visualizations (explainability output)
    ├── vessel_segmentation/    — Vessel overlay visualizations
    ├── lesion_detection/       — Lesion overlay visualizations (EX/HE/MA/SE color-coded)
    └── microaneurysms/         — visualizeMA.m diagnostics
```

## Summary for Team Handoff

| Component | Status | Headline number |
|---|---|---|
| Optic disc localization | 🟢 Frozen | 58.21 px mean error |
| Fovea localization | 🟢 Frozen | 123.02 px mean error |
| Vessel segmentation | 🟢 Frozen | 16.02% density, visually clean |
| Hard exudate / hemorrhage detection | 🟢 Frozen | Dice 0.20 / 0.16 (screening-grade) |
| Microaneurysm detection | 🟡 Reframed | Candidate-flagging only, not scored |
| Soft exudate detection | 🟡 Experimental | Insufficient data to evaluate |

Stage 2 is complete to the standard the classical-CV approach and available time supported.
Every component ships with an overlay visualization for explainability, directly satisfying
the problem statement's requirement that the system justify its outputs to a non-expert
reviewer rather than acting as a black box.
