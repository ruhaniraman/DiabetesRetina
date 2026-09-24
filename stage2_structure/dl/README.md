# Stage 2 lesion network (U-Net)

A trained replacement for the rule-based lesion detection. The rule-based overlay was switched off after validation showed it doesn't detect lesions (`validation/LESIONS.md`).
For every pixel it gives an independent probability for five things:
- **MA**: microaneurysm
- **HE**: haemorrhage
- **EX**: hard exudate
- **SE**: soft exudate
- **OD**: optic disc

The outputs are independent rather than one choice per pixel, because lesions can overlap: an MA can sit inside a haemorrhage.

## Files

| File | What it does |
|---|---|
| `prepareLesionData.m` | Prepares the IDRiD segmentation set (81 photographs with expert pixel masks).<br>Each photo is cropped to the retina and resized so the retina is 1792 px wide. Masks are downscaled so microaneurysms don't vanish.<br>Split: 45 train / 9 validation / 27 official test.<br>Cached in `data/stage2_cache/`. |
| `trainLesionSegmenter.m` | Trains a U-Net (depth 4, 32 first filters, 7.8M parameters) with a custom training loop.<br>Uses 256×256 patches, 80% centred on lesions, with flips, rotations and brightness/contrast jitter.<br>Loss: binary cross-entropy + soft Dice.<br>Keeps the checkpoint with the best mean lesion AUPR on validation, and sets each channel's threshold for the best validation Dice. |
| `segmentLesionsDL.m` | Applies the model to any fundus photograph (any camera or size) and returns probabilities and masks at the input's size.<br>The retina is resized to the training scale, so it works across cameras. |
| `evaluateLesionSegmenter.m` | Three checks:<br>1. IDRiD official test set at full resolution (AUPR, the IDRiD challenge measure, and Dice).<br>2. The classical pipeline on the same photographs.<br>3. APTOS healthy vs diseased eyes: the test the old overlay failed.<br>Writes `validation/results/lesions_dl.{md,json}`. |
| `normaliseFundus.m`, `predictTiles.m`, `lesionPR.m` | Helpers: per-photo colour normalisation, tiled whole-image prediction, and pooled precision-recall. |

## Run (MATLAB, from the repo root)

```matlab
addpath('utils','stage1_quality','stage2_structure','stage2_structure/dl')
trainLesionSegmenter        % ~2 h on an RTX 3050 (10,000 iterations); saves stage2_structure/dl/Stage2_LesionUNet.mat
evaluateLesionSegmenter     % ~30-60 min (the classical pipeline is the slow part; pass struct('Classical',false) to skip it)
[prob, masks] = segmentLesionsDL('photo.jpg');
```

Run one MATLAB training job at a time. Stage 3 training (with its background data workers) and this training at the same time ran out of memory on a 24 GB machine.

## Known limits

- **Only 54 annotated training photographs, from one camera (IDRiD).** Expect weaker results on other cameras. The APTOS check (part 3 of the evaluation) measures this.
- **Neovascularisation is not included:** none of the problem-statement datasets has pixel masks for it. FGADR has NV masks, but it is available on request only.
- **Vessels are not part of this network.** The classical `vesselSegmentation.m` still does them. DRIVE (in the problem statement) would be the dataset for a trained vessel model.
