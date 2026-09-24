# Stage 3 fine-tuning (APTOS + IDRiD + Messidor-2)

**Default:** full-resolution APTOS (the original competition images) plus IDRiD, prepared at **384×384** (the deployed model used 224×224 copies, where microaneurysms mostly disappear), with IDRiD training images oversampled 3×. The same ResNet-18 weights run at 384 because the network ends in global average pooling; only the input layer is replaced, keeping its normalisation statistics. The app, Grad-CAM and `validation/predictFiles.m` read the input size from the network, so a 384 model can be deployed without code changes. `finetuneStage3(struct('InputSize',224,'AptosSource','224'))` reproduces the original 224 setup.

This fine-tunes the deployed network (`stage_3/Stage3_Final_HighSensitivity_Model.mat`, a ResNet-18) on the grading datasets the problem statement names.
The deployed model was trained on APTOS only. On IDRiD it keeps its sensitivity (92%) but its specificity falls to 67%, below the 85% target (`validation/REPORT.md`).
Fine-tuning on data from more cameras is meant to fix that.

## 1. Install MATLAB (on D:)

C: has little free space, so install to `D:\MATLAB\R20xxx` and choose the install folder in the installer.

Products to install:
- **Deep Learning Toolbox**. Training, and `classify` in the app.
- **Image Processing Toolbox**. `preprocessForNetwork`, `imresize`, augmentation.
- **Parallel Computing Toolbox**. **Required for GPU training.** It also makes image caching parallel.
- **Deep Learning Toolbox Model for ResNet-18 Network**, a support package. It is optional, because the network comes from our `.mat` file.
- Also for later stages: Computer Vision Toolbox, Statistics and Machine Learning Toolbox, Simulink, and Medical Imaging Toolbox (the problem statement lists all of them).

Then check the GPU in MATLAB with `gpuDevice`. It should show the RTX 3050. If it errors, update the NVIDIA driver.

For the web app, install the MATLAB engine into the backend venv:
`cd "D:\MATLAB\R20xxx\extern\engines\python"`, then run `D:\DiabetesRetina\backend\.venv\Scripts\python -m pip install .`.
Then set `DISABLE_MATLAB=false` in `backend/.env`.

## 2. Download the datasets into `data/` (git-ignored)

| Dataset | Where it goes | Source |
|---|---|---|
| APTOS 2019, full resolution (default) | `data/aptos2019_full/train_images/<id>.png` and `data/aptos2019_full/train.csv` | Kaggle competition `aptos2019-blindness-detection`. **Accept the competition rules on the website first**, or the download fails with 403. Then run `kaggle competitions download -c aptos2019-blindness-detection -p data/aptos2019_full` and unzip it. |
| APTOS 2019, 224 copy | `data/aptos2019/colored_images/<No_DR\|Mild\|Moderate\|Severe\|Proliferate_DR>/<id>.png` | The same layout `validation/` already uses. Ask the teammate who trained the model which Kaggle download it was, because the ids must match `Stage3_checkpoint.mat`. |
| IDRiD grading | `data/idrid_grading/B. Disease Grading/B. Disease Grading/{1. Original Images,2. Groundtruths}/...` | IEEE DataPort, the "B. Disease Grading" part (the layout `validation/external_idrid.py` uses) |
| Messidor-2 images | `data/messidor2/IMAGES/` | ADCIS (free, after registration) |
| Messidor-2 exam list | `data/messidor2/messidor-2.csv` | Comes with the ADCIS download. It pairs the two eyes of each patient, which the patient-level split needs. |
| Messidor-2 grades | `data/messidor2/messidor_data.csv` | The Kaggle "Messidor-2 DR grades" set (Krause et al. adjudicated ICDR grades). ADCIS ships images without grades. |

## 3. Run (MATLAB, from the repo root)

```matlab
addpath('utils', 'stage1_quality', 'stage_3', 'stage_3/finetune')
checkSetup                % toolboxes, GPU, datasets, model: fix any FAIL first
buildGradingManifest      % check the split table it prints
finetuneStage3            % 384 px: ~15 min one-off image prep + ~1.5 min/epoch on an RTX 3050 (224 px: ~30 s/epoch)
evaluateFinetuned         % deployed vs fine-tuned on every held-out test split
scoreValidation('Stage3_Finetuned_run2.mat')   % validation-split scores to CSV, for re-choosing the threshold
```

## The split, and what stays unseen

| Dataset | Train | Validation | Test (never trained on) |
|---|---|---|---|
| APTOS | recorded train split | recorded validation split | **the same 548 images as `validation/REPORT.md`** |
| IDRiD | 85% of the official training set | 15% of it | official testing set (103) |
| Messidor-2 | none | none | **all gradable images (1,744)**, the external benchmark |

- The threshold and the temperature are chosen on the validation split only. The test split is used only by `evaluateFinetuned`.
- Messidor-2 is test-only (team decision 2026-09-24). Published referable-DR results on Messidor-2 use the whole dataset (for example Abràmoff 2016 IDx-DR, and Gulshan 2016), so ours stay comparable. Note that our reference grades are the Krause et al. adjudicated grades. When the images arrive, `evaluateFinetuned` includes them without retraining.
- IDRiD: `validation/` used to treat all 516 images as external data. After fine-tuning, only the 103 official test images are unseen, so compare on those.
- `splits.csv` records the exact split. Commit it with any model you plan to deploy.

## What you get

`stage_3/Stage3_Finetuned_Model.mat` contains:
- `trainedNetWeighted`, the same kind of network as before, so the app, Grad-CAM and `validation/` work unchanged.
- `stage3Results.threshold`, chosen for 95% validation sensitivity.
- `stage3Results.temperature`, a temperature-scaling factor for calibrated probabilities. The app does not apply it yet.
- The training settings, the split counts and the training curves.

The deployed model is not replaced automatically. Deploy only if the fine-tuned model is at least as sensitive on every test split and more specific on IDRiD and Messidor-2.
After deploying, re-run `validation/` and regenerate `docs/CLINICAL_REVIEW.md`, because every number there describes the old model.
