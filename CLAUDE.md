# DiabetesRetina ("Retina Rescue")

Smart India Hackathon **SIH26038** (MathWorks): *Explainable AI for Diabetic Retinopathy Screening in Rural India*.
The full problem statement is in `context.txt` at the repo root. That file is local only (ignored through `.git/info/exclude`, not `.gitignore`), so never commit it.
`README.md` is the detailed, up-to-date user and developer guide. This file summarises it and adds the problem-statement view.

## Problem statement targets
- The pipeline must be **MATLAB-based**. Toolboxes: Image Processing, Computer Vision, Deep Learning, Medical Imaging, Simulink, Statistics & ML.
- 1. Quality: focus, illumination and FOV checks. Enhance borderline images (CLAHE, illumination normalization, denoising). Reject ungradeable ones with recapture feedback.
- 2. Segmentation: OD and fovea, vessels, microaneurysms (sub-pixel), exudates, hemorrhages, **neovascularization**.
- 3. Grading: ICDR 0–4. For referable DR (level 2+), sensitivity must be **>90%** and specificity **>85%**.
- 4. Explainability: Grad-CAM, lesion-level evidence tied to clinical criteria, **calibrated confidence**, annotated reports an ophthalmologist can review in under 30 s.
- 5. Simulink: model acquisition rate, **bandwidth**, throughput and review capacity, and optimize resources for 100k+ patients/year per district.
- Validation against published benchmarks, showing the integrated pipeline beats single techniques.
- Datasets: APTOS 2019, IDRiD, DRIVE, Messidor-2.

## Layout
| Path | What it is |
|---|---|
| `stage1_quality/` | **`assessFundusQuality.m`**: MATLAB port of `backend/quality.py` (the gate the web app runs); same measures, thresholds and messages, including the FOV-adequacy (partial retina), colour-fundus and optic-disc checks. It gives the same verdict as the Python gate on 97.3% of 698 photos (same reject decision 99.4%; `validation/results/stage1_parity.md`). **`enhanceForReview.m`**: illumination normalisation + CLAHE + bilateral denoising, for display only; `validation/results/enhancement.md` shows it does not help the grader. The old `assessImageQuality.m` failed validation and is unused. |
| `stage2_structure/` | Classical MATLAB CV (OD, fovea, vessels, lesions; `Stage2_Documentation.md`, samples in `examples/`, new outputs in the git-ignored `results/`). **`dl/`** holds the trained networks the app uses: the **vessel U-Net** (`Stage2_VesselUNet.mat`; `trainVesselSegmenter.m`, `segmentVesselsDL.m`), the **disc/fovea localiser** (`Stage2_Localiser.mat`; `trainLocaliser.m`, `locateDiscFovea.m`, `anatomyLandmarks.m`), `anatomyOverlayToFile.m` (the app's Anatomy view), and the lesion U-Net (`Stage2_LesionUNet_v2.mat`, see `dl/README.md`): `lesionOverlayToFile.m` (overlay + counts + ICDR evidence), `lesionEvidence.m`, `estimateFovea.m`, `calibrateLesionMasks.m`, `evaluateLesionSegmenter.m`, `validateLocalisation.m`. **`nv/`**: image-level new-vessel suspicion (`nvFeatures.m`, `buildNvDataset.m`), research only, not in the app. |
| `stage_3/` | `Stage3_Final_HighSensitivity_Model.mat` is the **fine-tuned ResNet-18 (run 2), deployed 2026-09-24**: 384 px, full-resolution APTOS + IDRiD, referral threshold **0.0964**, temperature 1.217 for calibrated confidence. `loadStage3Model.m` returns net, threshold, classes, temperature. `assessBilateralFromFiles.m` reports temperature-scaled confidence; the referral decision uses the raw score. `finetune/` has the training pipeline. `Stage3_checkpoint.mat` holds the split validation uses, so **keep it**. The previous 224 px model is in git history (and locally as the untracked `Stage3_previous_224px_Model.mat`). |
| `utils/` | `preprocessStage3Input.m` crops the retina, pads it to a square and resizes it to the network's input size. `stage3Scores.m` averages the scores of the image and its mirror image. `projectRoot.m` gives paths that don't depend on the working directory. |
| `stage4_explainability/` | `core/referralGradCAM.m` and `gradCamToFile.m` produce Grad-CAM of the *referral* score (12x12 grid with the 384 px model), and the backend calls them. `report/formatReportText.m` holds the MATLAB report wording. `createMedicalReport.m` is a legacy dev tool. |
| `stage5_simulink/` | `simulateScenarioJson.m` (one scenario's year in Simulink, for the app's **Confirm in Simulink**). **`DistrictScreening.slx`** (core Simulink: capture → upload → AI → review backlog queues, one step per working day), `districtParameters.m` (measured vs assumed inputs), `runDistrictModel.m`, `optimiseDistrictResources.m` (cheapest resources per scenario, writes `results/district_plan.md` and `backend/pipeline_results.json` for `/api/simulation`), `measureAiSeconds.m`. The old `DRScreeningFlow.slx` needs SimEvents, which is licensed but not installed here. See its README. |
| `backend/` | FastAPI on port 5000. Stage 1 is `quality.py` (OpenCV). Stages 2, 3 and 4 run through `MatlabService` (`matlab.engine`). The Stage 2 overlay is **off by default** (`ENABLE_LESION_OVERLAY`). Wording lives in `clinical_text.py` (incl. `LESION_EVIDENCE_TEXT`) and the PDF is built by `report_pdf.py`. Every route checks the session with the auth-server. Tests are in `tests/`. |
| `auth-server/` | Express + `node:sqlite` on port 4000. It handles signup, email verification, login (HttpOnly cookie), password reset, account deletion, and AES-GCM-encrypted patient profiles and exam history (`vault.js`). |
| `frontend/` | React 19 + Vite + Tailwind + i18next (en, hi, kn, ta). Routes are protected. It has Dashboard (low-bandwidth mode), PatientDetails, DetailedReport (views: Original, Grad-CAM, Enhanced, Anatomy, possible lesions with ICDR evidence; PDF), Exam History (change vs previous exam), Listen-to-result (Web Speech; Hindi and Kannada are off until reviewed), and the English-only **Specialist review** (`/review`, timed 30-second review, P(PDR)), **District Planner** (`/district`, Stage 5 live + Confirm in Simulink) and **Evidence** (`/evidence`, generated by `validation/export_evidence.py`; a test fails when stale). Tests use Vitest. |
| `validation/` | `results/` is committed. The main reports are:<br>- `REPORT.md`: the deployed Stage 3 model on full-resolution photos.<br>- `results/benchmark.md`: integrated vs single techniques, and published results with sources.<br>- `results/calibration.md`: temperature scaling.<br>- `results/site_calibration_idrid.md`.<br>- `results/gradcam.md`: Grad-CAM trust tests.<br>- `results/localisation.md`: disc and fovea.<br>- `results/lesions_dl_*.md`: lesion U-Net.<br>- `results/vessels_drive.md`.<br>- `results/nv.md`: new vessels.<br>- `results/stage1_parity.md`: MATLAB vs Python Stage 1.<br>- `results/enhancement.md`.<br>- `QUALITY.md`: Stage 1.<br>- `LESIONS.md`: the retired OpenCV overlay, whose code is in `legacy_overlay.py`. |
| `calibration/` | Per-site referral threshold calibration from clinician-graded images. The result is applied through `REFERRAL_THRESHOLD`. |
| `docs/` | Clinician review packet (`CLINICAL_REVIEW.md`, generated by `docs/tools/`) and a review packet for the spoken translations. |
| `deploy/` | Caddy HTTPS, systemd units, `DEPLOYMENT.md`. |
| `.github/workflows/ci.yml` | CI for the frontend, backend and auth-server. It skips MATLAB. |

## Running
- Auth: `cd auth-server && cp .env.example .env && npm install && npm run dev`. Without Gmail configured, codes print to the terminal.
- Backend: `cd backend && pip install -r requirements.txt && cp env.example .env && python server.py`. The MATLAB engine is installed separately and its version must match the MATLAB release (see `requirements.txt`; `matlabengine` 26.1 is installed on Manosh's machine). `DISABLE_MATLAB=true` runs without MATLAB, and Stages 2-4 then return 503. `SERVICE_KEY` must match between backend and auth-server, or history isn't saved.
- Frontend: `cd frontend && npm install && npm run dev` (port 5173). The env vars are `VITE_AUTH_API_URL`, `VITE_ML_API_URL` and `VITE_ENABLE_LESION_OVERLAY` (see `.env.example`).
- Tests: `frontend: npm run lint && npm test`, `auth-server: npm test`, `backend: pip install -r requirements-dev.txt && python -m pytest`, `python -m pytest validation`, `python -m pytest calibration`.
- **Clinical wording** lives in three places: `backend/clinical_text.py`, `frontend/src/clinicalText.js` (plus `frontend/src/locales/*.json`) and `stage4_explainability/report/formatReportText.m`. Tests fail on reassuring or "required" phrasing, when the web and PDF wording drift apart, and when `docs/CLINICAL_REVIEW.md` is stale. After editing wording, regenerate with `python docs/tools/build_clinical_review.py` (and run `export_stage4_text.py` first if the MATLAB text changed).
- Rebuilding Stage 3 validation after a model change: `python validation/run_deployed_predictions.py`, `analyze.py`, `calibration_eval.py`, `gradcam_eval.py` + `analyze_gradcam.py`, then the review packet.

## Validation headline (`validation/REPORT.md`, deployed model, full-resolution photographs)
- APTOS test (548, held out): referable DR **sensitivity 96.9%, specificity 88.3%** at threshold 0.096, AUC 0.977, kappa 0.860. Meets the PS targets. Excluding leaked duplicates: 96.4% / 87.8%. The previous 224 px model reached 97.8% / 83.7% on the same photos.
- 5-class grade right 79.4%; Severe 62%, Proliferative 57%. 7 referable cases missed (6 Moderate, 1 Proliferative `eaa0dfbd5024`).
- IDRiD test (103): 90.6% / **53.8%** (previous model 30.8%), AUC 0.922. Below the specificity target. A threshold calibrated on IDRiD's validation photos gives 89.1% / 74.4% (`results/site_calibration_idrid.md`).
- Confidence: temperature scaling cuts ECE 0.047→0.037 (APTOS) and 0.145→0.118 (IDRiD); the High band is right 98% of the time.
- Grad-CAM: pixel AUC 0.70 on IDRiD lesion masks; deleting the hottest cells lowers the score +0.22 more than random cells.
- Lesion U-Net v2 (calibrated): IDRiD test Dice MA 0.45, HE 0.42, EX 0.62, SE 0.51, OD 0.88; marks something in 34% of healthy APTOS test eyes vs 98-100% of eyes with DR.
- Disc/fovea **localiser** (IDRiD test, 103): mean error disc 14.9 px, fovea 53.8 px (challenge winners 21.1 / 64.5; the old estimate from the disc 66 / 284); fovea within 1 DD in 99%.
- **Vessel U-Net** (DRIVE, 4-fold out-of-fold on the 20 annotated photos): accuracy 0.950, sensitivity 0.799, AUC 0.971, with enhancement (enhanceForReview) before the network so dark, low-contrast cameras such as IDRiD work (classical 0.896 / 0.691 / 0.887; B-COSFIRE 0.944 / 0.766 / 0.961 on the test set, so indicative).
- **Low-bandwidth mode** (1800 px JPEG 0.85): same referral decision for 99.5% of APTOS and 98.1% of IDRiD test photos; 2G upload per eye 284→20 s (`results/compression.md`).
- Stage 1 MATLAB port agrees with the app's Python gate on 97.3% of 698 photos. Enhancement (CLAHE etc.) does not help the grader.
- Stage 5 (`stage5_simulink/results/district_plan.md`): 100k patients/year need about 8 camera sites, 1 GPU server (4.5 s AI per patient), 1 reviewer at 30 s per case, and 2G-grade links for JPEG. Camera sites bind; specificity drives the reviewer load.
- Benchmarks and new vessels: see gaps 2-4 below.

## Gaps against the problem statement (open)
1. Stage 1 runs in Python by default; `STAGE1_ENGINE=matlab` runs the MATLAB port (`assessFundusQualityFile.m`), falling back to Python when MATLAB is down.
2. **Neovascularization**: none of the PS datasets has NV masks. The app shows the calibrated CNN P(PDR) in the specialist review (AUC 0.91 for PDR on both test sets). `stage2_structure/nv/` builds an image-level NV suspicion model from vessel and haemorrhage features (`validation/results/nv.md`): AUC 0.77 (APTOS) / 0.86 (IDRiD) with the classical vessels, weaker than P(PDR), and combining doesn't help; not shown in the app. **The rebuild with the vessel U-Net is NOT done**: `buildNvDataset('unet')` then `python validation/nv_eval.py unet` (writes `nv_features_unet.csv`, `nv_unet.md/json`). It takes ~42 min (1.8 s/photo, 1,398 photos); a run on 2026-09-25 was stopped at the user's request at ~150 photos. Stop the backend first.
3. **Vessels**: closed by the vessel U-Net with enhanced input (see headline). DRIVE is in `data/drive/DRIVE/` (Kaggle mirror, manual masks for the 20 training photos only).
4. **Benchmarks** (`validation/results/benchmark.md`): integrated (CNN + lesion network) vs CNN alone gives AUC +0.001 on APTOS and -0.005 on IDRiD, both within noise. The integrated pipeline beats the classical rule-based detector by a wide margin but does **not** beat the CNN alone for the referral decision. Against published results: the localiser beats the IDRiD winners (disc 14.9 vs 21.1 px, fovea 53.8 vs 64.5 px) and the vessel U-Net beats published DRIVE figures (indicative); IDRiD grade accuracy (0.553 vs 0.631) and lesion AUPR (0.08-0.19 lower) still trail.
5. **Messidor-2** images are awaited from ADCIS (`data/messidor2/IMAGES/` is empty); `evaluateFinetuned` includes them automatically.
6. The retired OpenCV overlay is kept in `validation/legacy_overlay.py` (copied from commit 73057ad) only so `LESIONS.md` can be reproduced; `evaluate_lesions.py` uses it.
7. Wording needs clinician review (`CLINICAL_REVIEW.md`, incl. section 3e).
8. **Translation review (team to do):** the hi/kn/ta strings Claude drafted on 2026-09-24 still need a native-speaker check. They are the `report.evidence*` keys (lesion evidence against ICDR) and the updated `clinical.stageNote` numbers in `frontend/src/locales/{hi,kn,ta}.json`. The earlier "Possible lesions" overlay strings were already verified by the team. Added 2026-09-25, also to check: `report.anatomy*`, `report.enhanced*`, `dash.lowBandwidth*`, `dash.transfer`, `history.higher/lower/same`.

## Where we left off (2026-09-25 morning)
- Branch `stage2-unet-stage3-finetune`: 15 commits on top of `73057ad`, **not pushed, not merged into `main`**. All commits are subject-line only (history rewritten on 2026-09-25; see Repo notes). The working tree was clean after `fd51d4a`, apart from this file.
- Tests at the last run: backend 331, validation + calibration 64, frontend 302 and lint clean. **The frontend suite needs `VITE_ENABLE_LESION_OVERLAY` off** (one test checks the default); `frontend/.env.local` currently turns it on for the demo, so run `VITE_ENABLE_LESION_OVERLAY=false npx vitest run`.
- Added overnight (all committed): vessel U-Net (enhanced input), disc/fovea localiser, Anatomy + Enhanced report views, specialist review (`/review`), District Planner with Confirm in Simulink (`/district`, `/api/simulation/run`), low-bandwidth mode, Evidence page (`/evidence`), exam change chips, `STAGE1_ENGINE`, P(PDR) from Stage 3 (`assessBilateralFromFiles` has 10 outputs). Demo guide: `docs/DEMO_WALKTHROUGH.md`.
- Verified end to end through the real API with MATLAB on 2026-09-25: Stage 1 in MATLAB (accept/reject), grading, Grad-CAM, Enhanced (5-7 s), Anatomy (~16 s), lesions, PDF, `/api/simulation`, `/api/simulation/run`. Not yet clicked through in a browser by the user.
- **State of the machine:** backend stopped (it was stopped for the NV rebuild); frontend (5173) and auth-server (4000) were running from this session and will not survive a restart. Start all three as in *Running*.
- **Local demo config (not in git):** `backend/.env` has `DISABLE_MATLAB` commented out, `ENABLE_LESION_OVERLAY=true`, `STAGE1_ENGINE=matlab` (the original file is `data/backend.env.before-demo`); `frontend/.env.local` has `VITE_ENABLE_LESION_OVERLAY=true`. Test account: `e2e.1790303566@example.com` / `Demo-pass-2026!`. Email is not configured (codes go to the auth-server console); the user chose not to set up Gmail OTP for now. Demo photos: `data/demo/` (held-out test photos).
- `measureAiSeconds` with the anatomy step: 31.1 s per patient (4.5 s without it). Anatomy is on demand, so `districtParameters.aiSecondsPerPatient` stays 4.5.
- **Next up / waiting:**
  1. The user will make the PPT and demo video (their task; follow `docs/DEMO_WALKTHROUGH.md`).
  2. NV rebuild with the vessel U-Net (gap 2), if wanted.
  3. Messidor-2 images from ADCIS (the user must accept the licence; Claude does not use unofficial mirrors), then `stage_3/finetune/evaluateFinetuned.m` and a Messidor-2 row in `benchmark.md`.
  4. Clinician review of `docs/CLINICAL_REVIEW.md`; native-speaker check of the hi/kn/ta strings (gap 8).
  5. Decide whether to push the branch and merge into `main`.
  6. Possible technical steps: IDRiD specificity (more IDRiD-like data or per-site calibration), pixel-level NV data (FGADR, on request).
- **Local-only files** (not in git): `stage_3/Stage3_previous_224px_Model.mat`, `Stage3_Finetuned_run1.mat`, `Stage3_Finetuned_Model.mat`, `trainedNet.mat`, `data/Stage2_VesselUNet_raw_backup.mat` (the raw-input vessel network).

## Environment notes
- Training runs on Manosh's machine: RTX 3050 6 GB, 24 GB RAM, **MATLAB R2026a at `D:\MATLAB`** (`D:/MATLAB/bin/matlab.exe -batch ...` works headless). C: has about 5 GB free.
- **Run one MATLAB job at a time and close the MATLAB desktop while training.** RAM ran out twice; lesion training uses about 9 GB.
- Kaggle CLI and credentials (`~/.kaggle/kaggle.json`) are set up; DRIVE came from Kaggle. `matlabengine` 26.1 is installed in the local Python (miniconda).
- `data/` (gitignored) has DRIVE (`drive/DRIVE/`), APTOS (224 px copies in `aptos2019/`, full resolution in `aptos2019_full/`), IDRiD grading/segmentation/localization, the Messidor-2 grades CSV, and caches in `stage2_cache/` and `stage3_cache/`. `stage_3/finetune/manifest.csv` is machine-specific (ignored); `splits.csv` is the record.

## Repo notes
- `*.mat`, `*.png` and `results/` are gitignored except `validation/results/`. The tracked ones were force-added (the deployed Stage 3 model, `Stage2_LesionUNet_v2.mat`, `Stage2_VesselUNet.mat`, `Stage2_Localiser.mat`, `stage5_simulink/results/`). `.gitignore`'s `data/` would also hide `frontend/src/data/`, so that folder is explicitly un-ignored. The model `.mat` files are large binaries in git with no LFS.
- Work since 2026-09-24 is on branch `stage2-unet-stage3-finetune` (not pushed; see "Where we left off").
- **Commit style (user's rule):** one brief subject line, no body, no Claude co-author or session trailer. `stage_3/trainedNet.mat` was removed from the repo (restore with `git checkout 73057ad -- stage_3/trainedNet.mat`).
- On 2026-09-23 upstream `main` was force-pushed (history rewritten, new hashes). A clone from before that date must be reset to `origin/main`, not merged.
