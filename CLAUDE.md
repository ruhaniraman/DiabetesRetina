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
| `stage1_quality/` | Original MATLAB quality gate (`assessImageQuality.m`). **The app does not use it.** The web app runs `backend/quality.py`, which was rebuilt after validation. |
| `stage2_structure/` | Classical MATLAB CV (OD, fovea, vessels, lesions; `Stage2_Documentation.md`, samples in `examples/`, new outputs in the git-ignored `results/`). **`dl/`** holds the trained lesion U-Net the app uses (`Stage2_LesionUNet_v2.mat`, see `dl/README.md`): `lesionOverlayToFile.m` (overlay + counts + ICDR evidence), `lesionEvidence.m`, `estimateFovea.m`, `calibrateLesionMasks.m`, `evaluateLesionSegmenter.m`, `validateLocalisation.m`. |
| `stage_3/` | `Stage3_Final_HighSensitivity_Model.mat` is the **fine-tuned ResNet-18 (run 2), deployed 2026-09-24**: 384 px, full-resolution APTOS + IDRiD, referral threshold **0.0964**, temperature 1.217 for calibrated confidence. `loadStage3Model.m` returns net, threshold, classes, temperature. `assessBilateralFromFiles.m` reports temperature-scaled confidence; the referral decision uses the raw score. `finetune/` has the training pipeline. `Stage3_checkpoint.mat` holds the split validation uses, so **keep it**. The previous 224 px model is in git history (and locally as the untracked `Stage3_previous_224px_Model.mat`). |
| `utils/` | `preprocessStage3Input.m` crops the retina, pads it to a square and resizes it to the network's input size. `stage3Scores.m` averages the scores of the image and its mirror image. `projectRoot.m` gives paths that don't depend on the working directory. |
| `stage4_explainability/` | `core/referralGradCAM.m` and `gradCamToFile.m` produce Grad-CAM of the *referral* score (12x12 grid with the 384 px model), and the backend calls them. `report/formatReportText.m` holds the MATLAB report wording. `createMedicalReport.m` is a legacy dev tool. |
| `stage5_simulink/` | **`DistrictScreening.slx`** (core Simulink: capture → upload → AI → review backlog queues, one step per working day), `districtParameters.m` (measured vs assumed inputs), `runDistrictModel.m`, `optimiseDistrictResources.m` (cheapest resources per scenario, writes `results/district_plan.md` and `backend/pipeline_results.json` for `/api/simulation`), `measureAiSeconds.m`. The old `DRScreeningFlow.slx` needs SimEvents, which is licensed but not installed here. See its README. |
| `backend/` | FastAPI on port 5000. Stage 1 is `quality.py` (OpenCV). Stages 2, 3 and 4 run through `MatlabService` (`matlab.engine`). The Stage 2 overlay is **off by default** (`ENABLE_LESION_OVERLAY`). Wording lives in `clinical_text.py` (incl. `LESION_EVIDENCE_TEXT`) and the PDF is built by `report_pdf.py`. Every route checks the session with the auth-server. Tests are in `tests/`. |
| `auth-server/` | Express + `node:sqlite` on port 4000. It handles signup, email verification, login (HttpOnly cookie), password reset, account deletion, and AES-GCM-encrypted patient profiles and exam history (`vault.js`). |
| `frontend/` | React 19 + Vite + Tailwind + i18next (en, hi, kn, ta). Routes are protected. It has Dashboard, PatientDetails, DetailedReport (Grad-CAM, possible-lesion overlay with ICDR evidence, PDF), Exam History, and Listen-to-result (Web Speech; Hindi and Kannada are off until reviewed). Tests use Vitest. |
| `validation/` | `REPORT.md` (deployed Stage 3 model, full-resolution photos), `results/calibration.md` (temperature scaling), `results/site_calibration_idrid.md`, `results/gradcam.md` (Grad-CAM trust tests), `results/localisation.md` (disc/fovea), `results/lesions_dl_*.md` (lesion U-Net), `QUALITY.md` (Stage 1), `LESIONS.md` (the retired OpenCV overlay). `results/` is committed. |
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
- Disc found in 103/103 IDRiD test photos (median error 0.08 disc diameters); fovea estimate 90% within 1 DD.

## Gaps against the problem statement (open)
1. **The app doesn't use MATLAB for Stage 1.** Stage 1 is Python on purpose (the MATLAB gate failed validation). The MATLAB Stage 1 needs to match `quality.py`, plus a denoising step and an FOV-adequacy check.
2. **Neovascularization detection** is missing: none of the PS datasets has NV masks.
3. **Vessels** are only the classical `vesselSegmentation.m`, unvalidated; DRIVE is not downloaded.
4. **Benchmarks**: no comparison of the integrated pipeline with single techniques or published results yet.
5. **Messidor-2** images are awaited from ADCIS (`data/messidor2/IMAGES/` is empty); `evaluateFinetuned` includes them automatically.
6. **`validation/evaluate_lesions.py` / `test_lesions.py` are broken**: they import the retired OpenCV overlay (`server.segment_lesions`), removed in the Stage 2 wiring commit. `LESIONS.md` can't be regenerated until that heuristic is kept as a legacy module under `validation/`.
7. Wording needs clinician review (`CLINICAL_REVIEW.md`, incl. section 3e); the hi/kn/ta lesion-evidence strings are Claude's drafts.

## Environment notes
- Training runs on Manosh's machine: RTX 3050 6 GB, 24 GB RAM, **MATLAB R2026a at `D:\MATLAB`** (`D:/MATLAB/bin/matlab.exe -batch ...` works headless). C: has about 5 GB free.
- **Run one MATLAB job at a time and close the MATLAB desktop while training.** RAM ran out twice; lesion training uses about 9 GB.
- `data/` (gitignored) has APTOS (224 px copies in `aptos2019/`, full resolution in `aptos2019_full/`), IDRiD grading/segmentation/localization, the Messidor-2 grades CSV, and caches in `stage2_cache/` and `stage3_cache/`. `stage_3/finetune/manifest.csv` is machine-specific (ignored); `splits.csv` is the record.

## Repo notes
- `*.mat`, `*.png` and `results/` are gitignored except `validation/results/`. The tracked ones were force-added (the deployed Stage 3 model, `Stage2_LesionUNet_v2.mat`, `stage5_simulink/results/`). The model `.mat` files are large binaries in git with no LFS.
- Work since 2026-09-24 is on branch `stage2-unet-stage3-finetune` (not pushed). `stage_3/trainedNet.mat` was removed from the repo (restore with `git checkout 73057ad -- stage_3/trainedNet.mat`).
- On 2026-09-23 upstream `main` was force-pushed (history rewritten, new hashes). A clone from before that date must be reset to `origin/main`, not merged.
