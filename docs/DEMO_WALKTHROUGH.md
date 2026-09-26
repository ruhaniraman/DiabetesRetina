# Demo walkthrough (SIH26038)

A path through the app that shows every problem-statement requirement working, in about 6 minutes. Each step names the screen, what to do, and what
it proves. Demo photographs are held-out test photos, copied to `data/demo/` (local only, not in git: the datasets' licences do not allow
redistribution). No step uses a photo the models were trained on.

## Before recording

1. `backend/.env`: remove `DISABLE_MATLAB=true`; set `ENABLE_LESION_OVERLAY=true` and `STAGE1_ENGINE=matlab` (every stage then runs in MATLAB).
2. `frontend/.env.local`: `VITE_ENABLE_LESION_OVERLAY=true`.
3. Start the auth-server, the backend (wait for "MATLAB Engine ready" in its log) and the frontend (see README). Sign in.
4. Warm up once: run one assessment and open each report view, so the first MATLAB calls (model loading) are not on camera.

## The path

| # | Screen | Do | Shows (problem statement) |
|---|---|---|---|
| 1 | Dashboard | Upload `E_reject_blurred.jpg` as the left eye, then `E_reject_dark.jpg` | **Stage 1**: focus and illumination checks reject the photos with recapture instructions |
| 2 | Dashboard | Tick **Low-bandwidth mode (2G)**, upload `D_moderate_left` / `D_moderate_right` | Photos are shrunk in the browser; the sizes sent and the upload time on a 2G link are shown (**Stage 5, bandwidth**). The decision is unchanged (`validation/results/compression.md`) |
| 3 | Dashboard | **Run AI Assessment** | **Stage 3**: ICDR grade per eye, calibrated confidence band, referral decision |
| 4 | Detailed Report | **AI View** | **Stage 4**: Grad-CAM of the referral score |
| 5 | Detailed Report | **Enhanced** | **Stage 1**: illumination normalisation + CLAHE + denoising (display only; the grader uses the original, as validated) |
| 6 | Detailed Report | **Anatomy** | **Stage 2**: vessels (trained U-Net), optic disc and fovea (trained localiser), macula zone |
| 7 | Detailed Report | **Possible lesions** | **Stage 2**: microaneurysms, haemorrhages, hard and soft exudates, with counts and ICDR evidence (quadrants, exudates near the fovea) |
| 8 | Detailed Report | **Download PDF Report**; **Listen to the result** (Hindi / Kannada / Tamil UI) | Annotated report; multilingual access for rural patients |
| 9 | Dashboard → **Specialist review** | Read the screen, click **Agree: refer**; repeat with `B_proliferative_*` | **Stage 4**: the one-screen review; the timer shows it done in under 30 s. P(proliferative DR) is the **new-vessel** signal |
| 10 | Dashboard → **District Planner** | Move *Patients per year* to 200,000; switch camera to *not calibrated*; set review to 120 s | **Stage 5**: resources re-planned live (camera sites, uplink, GPU, reviewers, ₹/patient); specificity and the 30-second report drive the specialist load |
| 11 | District Planner | **Confirm in Simulink** | **Stage 5**: a year of `DistrictScreening.slx` runs in MATLAB; the backlog charts show every stage within its limit |

## Talking points

- The validation numbers (sensitivity 96.9%, specificity 88.3% on 548 held-out photos, ...) are in `validation/REPORT.md`.
- The system says where it falls short: IDRiD specificity without site calibration, pixel-level new vessels (no dataset in the problem statement has them),
  and integrated vs CNN-alone referral accuracy (equal, not better).
- Healthy example: `A_healthy_*` (APTOS, No DR) gives no referral and a clear anatomy view.
