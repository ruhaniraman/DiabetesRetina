# Retina Rescue: diabetic retinopathy screening

A screening aid that grades diabetic retinopathy (DR) from fundus photographs of both eyes.

> **Screening aid only.** Output is produced by automated image analysis. It is not a medical diagnosis and must be
> reviewed by a qualified eye-care professional.

## Architecture

```
frontend/       React + Vite web app (port 5173)
auth-server/    Node/Express: sign-up, phone (SMS code) verification, login, sessions (port 4000, SQLite via node:sqlite)
backend/        Python/FastAPI: image analysis API (port 5000)
   ├─ Stage 1  image quality check           OpenCV (MATLAB port: stage1_quality/assessFundusQuality.m); enhanced view: MATLAB enhanceForReview
   ├─ Stage 2  anatomy: vessels (U-Net), optic disc + fovea (localiser)   MATLAB → stage2_structure/dl/anatomyOverlayToFile.m
   │           possible-lesion overlay (MATLAB lesion network; off until clinically reviewed, see below)
   ├─ Stage 3  bilateral DR grading          MATLAB Engine → trained network (stage_3/)
   ├─ Stage 4  Grad-CAM of the referral score     MATLAB Engine → stage4_explainability/
   └─ Stage 5  district planning: /api/simulation (optimised plans), /api/simulation/run (a year in DistrictScreening.slx, Simulink)
stage1_quality/ (original MATLAB Stage 1; the app runs backend/quality.py) stage2_structure/ stage_3/ stage4_explainability/ stage5_simulink/ utils/   MATLAB source
```

The browser talks to both servers. The Python backend never sees passwords or the JWT secret: it forwards each
request's session (the cookie, or a Bearer token) to the auth-server (`GET /api/auth/me`) and rejects the request unless that succeeds, so
logging out revokes access everywhere.

## Prerequisites

- Node.js 22.13+ (the auth-server uses Node's built-in `node:sqlite`, so nothing needs compiling)
- Python 3.12+
- **MATLAB** (Deep Learning Toolbox, Image Processing Toolbox) plus its [Python engine](https://www.mathworks.com/help/matlab/matlab_external/install-the-matlab-engine-for-python.html), only for Stages 3 and 4
- The trained model `stage_3/Stage3_Final_HighSensitivity_Model.mat` (tracked in this repo)

## Setup and run

Start all three services (three terminals).

**1. Auth server**
```bash
cd auth-server
cp .env.example .env        # set JWT_SECRET (see the file for a generator command)
npm install
npm run dev
```
Verification and password-reset codes are printed in this terminal instead of being texted (development only), or set
`FIXED_OTP` for a fixed demo code; see [Phone verification](#phone-verification-sms-codes).

**2. ML backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt                       # + install the MATLAB engine, see the file
cp env.example .env
python server.py
```
No MATLAB? Set `DISABLE_MATLAB=true` in `.env`. Stages 1 and 2 still work; Stages 3 and 4 return a clear
`503` and the UI shows the error. It never substitutes a made-up result. `GET /api/health` reports the MATLAB status.

**3. Frontend**
```bash
cd frontend
npm install
npm run dev                  # http://localhost:5173
```
Override the API addresses with `frontend/.env.local` (see `frontend/.env.example`).

## Using it

1. Create an account with your mobile number and verify it, then sign in. Forgot your password? Use **Forgot password?** on the sign-in page:
   you'll get a 6-digit code by SMS, choose a new password, and every existing session is signed out.
2. Complete the patient profile (edit icon in "My Health Record"). It is saved to your account, so it is there next time you sign in.
3. Upload a fundus photo for each eye. Each is quality-checked; rejected images must be replaced.
4. **Run AI Assessment**, then open **Detailed Report** (its **Download PDF Report** button makes a report for both eyes) for per-eye grades and a heatmap of the regions that raised the referral score (a rough guide, not a lesion detector: `validation/results/gradcam.md`).
   Each assessment is saved to **Exam History** on the dashboard.

## Specialist review, district planning and low-bandwidth mode

- **Detailed Report → view modes.** *Original*, *AI View* (Grad-CAM of the referral score), *Enhanced* (Stage 1 illumination
  normalisation + CLAHE + denoising, `POST /api/stage1-enhance`; display only, because the grader works best on the unprocessed photo:
  `validation/results/enhancement.md`) and *Anatomy* (`POST /api/stage2-anatomy`: vessels from the trained vessel U-Net, optic disc and fovea from the
  trained localiser, and the macula zone of 1 disc diameter used for the "exudates near the fovea" evidence). *Possible lesions* appears when the lesion overlay is on.
- **Specialist review** (dashboard header, after an assessment; `/review`). The 30-second review the problem statement asks for, on one screen: both eyes'
  photo and Grad-CAM, AI grade with calibrated confidence, referral score against the threshold, calibrated probability of proliferative DR
  (the new-vessel signal: `validation/results/nv.md`) and, with the overlay on, lesion evidence against ICDR criteria. A timer runs from opening the case;
  each decision (agree/override, refer/routine, recapture) is logged in the browser with its time, and the page shows the median review time, the share
  within 30 s and the agreement with the AI. English only (for ophthalmologists).
- **District Planner** (dashboard header; `/district`). Stage 5 in the app: change patients per year, camera and calibration, review time, photo
  format, upload window, retakes and prevalence, and see the cheapest mix of camera sites, uplink, GPU servers and reviewers (the optimiser's capacity formulas,
  ported to `frontend/src/utils/districtPlan.js` and tested against the Simulink-confirmed plans). **Confirm in Simulink** runs a working year of
  `DistrictScreening.slx` for that plan through MATLAB and charts each stage's backlog against its limit. Below it are the scenarios
  `optimiseDistrictResources.m` confirmed. English only (for programme planners).
- **Low-bandwidth mode** (checkbox above the eye photos). The browser shrinks each photo to a JPEG at most 1800 px on its longest side before upload
  and shows the bytes sent and the time on a 2G-grade link (Stage 5's assumptions). The effect on grading is measured in `validation/results/compression.md`.

## Listen to the result

For people who cannot read it, the dashboard and the report page have a **Listen to the result** button (English, Hindi, Kannada). It reads the result aloud with the voices already built into the
phone or browser (the Web Speech API): nothing plays until it is tapped, nothing is recorded, and only voices that run **on the device** are used, because online voices would send the result to
another service. If the phone has no voice for the chosen language the screen says how to add one, and offers English. In Hindi and Kannada it reads **fixed sentences** (`frontend/src/speech/translations.json`), never machine translation (the machine translator has no Kannada model, and its Hindi mistranslated
safety-critical sentences). Those sentences are drafts, so **Hindi and Kannada speech is off until they are reviewed** (`docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md`); English works now. The words being read are shown on the page,
with the current sentence highlighted. Which sentences are spoken: `frontend/src/speech/reportScript.js`. Set `VITE_ALLOW_NETWORK_VOICES=true` only if you accept online voices, and `VITE_ALLOW_UNREVIEWED_SPEECH` (`hi`, `kn`, `hi,kn` or `true`) only for a demo that knowingly reads the unreviewed drafts of those languages (announced aloud first).

## Welcome tour

After every sign-in (not when a page reload only restores the session) a guided tour starts. It first spotlights the language buttons and asks "Choose your language" in all four
scripts; tapping one switches the site and starts a hands-on walkthrough of a full screening. At most steps the person **does the task**: fill in their details, switch low-bandwidth
mode, upload both photos (the tour waits until both pass the quality check), run the assessment, open the report, try a view, download the PDF, then visit Specialist review (only once there is
a result) and District Planner and come back. Only the spotlighted element can be used; the tour moves on by itself when the task is done ("Done!"), and brings the person back if they
leave the page. Steps without a task have Next; every task has "Skip this step"; Skip tour or Esc closes it, and the **Tour** button on the Dashboard replays it. Each popup is read aloud in the chosen language. The tour text holds no health information, so online voices may
be used for it. Hindi, Kannada and Tamil narration are unreviewed drafts and follow the same `VITE_ALLOW_UNREVIEWED_SPEECH` switch as Listen (otherwise the popup says why it is text only).
The speaker button mutes it (remembered in the browser). Steps and their tasks: `frontend/src/tour/steps.js`; words: `tour.*` in `frontend/src/locales/*.json`; elements are found by their `data-tour` attribute.

## The PDF report

**Download PDF Report** (Detailed Report page) calls `POST /api/report-pdf` with both photographs and, optionally, the patient's name and date of birth. The server runs the
same Stage 1 checks and grading as the assessment, draws each eye's heatmap, builds a one-page PDF in memory (`backend/report_pdf.py`) and returns it. It does **not** keep
the photographs or the PDF, and it does **not** add an entry to the exam history. The name and date of birth are printed on the report only. Because the photographs are
graded again, it takes about as long as an assessment and queues behind other MATLAB work. Names in scripts the report font cannot print (Devanagari, Kannada, ...) are replaced by
a note.

**Reports kept with the exam history.** Each assessment that is saved to the exam history also gets its own copy of this PDF: after the result has been
returned, the backend draws the heatmaps for the same photographs, builds the PDF from that same result (with the patient's name and date of birth from their
profile) and stores it with the exam (`PUT /api/internal/exams/:id/report`, service key only). The auth-server keeps it AES-256-GCM encrypted with `DATA_KEY`,
like the rest of the health data. **This copy contains the patient's eye photographs.** Clicking an exam's date in Exam History downloads it
(`GET /api/patient/exams/:id/report`, the owner only); exams saved before this feature, or whose PDF could not be built, say "No PDF saved". The copy is deleted
with its exam, with "erase my health data" and with the account. Building it uses the MATLAB engine for two heatmap runs after each assessment.

The wording is in `backend/clinical_text.py` (`PDF_TEXT`) and is part of the clinician review packet (`docs/CLINICAL_REVIEW.md`, section 3d). `stage4_explainability/report/createMedicalReport.m`
is an older single-photograph MATLAB generator kept as a developer tool; the app does not use it.

## Accounts and sessions

Signing in sets an `HttpOnly` cookie, so page scripts cannot read the session. Users can delete their account from the dashboard (trash icon, password required):
this erases the account, patient details and every saved assessment from the live database at once, and cannot be undone. Data in any backups you keep is not
touched (see `deploy/DEPLOYMENT.md`). The API also accepts `DELETE /api/auth/account` with a JSON `{ "password": ... }` body.

## Health data: what is stored

| Stored (per user) | Not stored |
|---|---|
| Patient profile: name, date of birth, gender, blood group, diabetes duration, blood pressure, HbA1c, fasting sugar | Retinal photographs (they are analysed in memory and discarded) |
| Each assessment: date, per-eye grade and confidence, overall grade, summary text | Grad-CAM heatmaps and lesion overlays; the downloadable PDF report (below) |

- **Encrypted at rest.** Profile and exam payloads are AES-256-GCM encrypted with `DATA_KEY` before they reach SQLite, so a
  copied database file is unreadable without the key (and tampering is detected). The account name, mobile number and login data are
  ordinary columns. **Back up `DATA_KEY` and never change it:** existing data cannot be decrypted without it.
- **Exam results come from the model, not the browser.** The ML backend saves each result itself using `SERVICE_KEY`
  (the same value in `auth-server/.env` and `backend/.env`); a signed-in user cannot write to their own history.
- **Users control their data.** They can delete a single exam, or all their health data, from the app
  (`DELETE /api/patient/exams/:id`, `DELETE /api/patient/data`).
- If `SERVICE_KEY` is unset, assessments still work but are not saved (the dashboard says so).
- This is not a compliance certification. For real patient data you still need consent, an access/audit policy, backups,
  TLS, and a legal review for your jurisdiction (e.g. HIPAA, GDPR, India's DPDP Act).

## Phone verification (SMS codes)

Accounts are identified by mobile number. Sign-up verification and password reset both send a 6-digit code by SMS.
A bare 10-digit number is taken as Indian (+91); other countries need the `+` country code.

No SMS provider is connected yet (`auth-server/sms.js`). In development the code is printed in the auth-server's terminal;
with `NODE_ENV=production` sending fails, so connect a provider (e.g. Twilio, MSG91) there before going live.

For a demo, set `FIXED_OTP=123456` in `auth-server/.env`: every sign-up and reset then accepts that code and nothing is sent.
It lets anyone verify any number or reset any password, so the server refuses to start with it in production.

## Model validation

`validation/REPORT.md` is a held-out evaluation of the Stage 3 model (sensitivity, specificity, AUC, kappa with confidence
intervals, threshold behaviour, a data-leakage audit, and a plain statement of what it does *not* show). It found and fixed
problems in the app: the wrong image preprocessing, a decision rule that ignored the model's tuned referral threshold, and (later) an input
preparation that suited wide-frame cameras badly; the app now crops the retina and averages the image with its mirror image.
Headline for the deployed model (fine-tuned at 384 px on full-resolution APTOS + IDRiD, deployed 2026-09-24): on 548 unseen full-resolution
photographs the referral decision flags 96.9% of referable patients at 88.3% specificity (threshold 0.096); the exact stage is
less reliable (79% correct). The confidence the app shows is temperature-calibrated (`validation/results/calibration.md`). On IDRiD's official
test set sensitivity is 90.6% but specificity only 53.8% (the previous model: 30.8%), so performance depends on the camera and population. `validation/QUALITY.md` covers the Stage 1 photo-quality gate, which was rebuilt after validation showed the old one
rejected good full-resolution photos and claimed to "enhance" images it never touched. This is an internal technical validation, **not** clinical
validation. Reproduce it with `validation/README.md`.

## Calibrating the threshold for a clinic

The referral threshold (0.096) was chosen on validation data that is mostly APTOS and over-refers on other cameras (IDRiD test: 53.8% specificity;
a threshold calibrated on IDRiD's own validation photographs raises it to 74.4% at 89.1% sensitivity, `validation/results/site_calibration_idrid.md`). `calibration/` is a tool that
takes a clinic's own clinician-graded photographs, runs the model, and reports what each sensitivity target would cost, with confidence
intervals, an honest hold-out estimate, and predictive values at the clinic's prevalence. It recommends a threshold only when told a target,
and the target is a clinical decision. The result is applied with `REFERRAL_THRESHOLD` in `backend/.env`. See `calibration/README.md`;
`calibration/example/` is a real run on IDRiD with the previous model. This is evidence, not approval.

## Clinical wording review

The app tells users things like "referral is recommended" and "no referral flagged". **None of that wording has been reviewed by a
clinician.** `docs/CLINICAL_REVIEW.md` is a review packet, generated from the real code and validation data: every message the tool can
show (web app, API summaries, PDF report), the model's measured performance and failure modes, what was changed and why, and a list
of questions for the reviewer, with a sign-off table. Wording lives in three files (`backend/clinical_text.py`,
`frontend/src/clinicalText.js`, `stage4_explainability/report/formatReportText.m`), and tests fail if risky phrasing (reassurance,
"required", clinical timings) creeps in or if the packet goes out of date. Regenerate it with
`python docs/tools/build_clinical_review.py` (and `python docs/tools/export_stage4_text.py` after editing the MATLAB text).
Machine-translated (Hindi/Kannada) summaries are labelled as such and have not been reviewed either.

## Deploying to production

`deploy/DEPLOYMENT.md` is the step-by-step guide: HTTPS through Caddy (`deploy/Caddyfile`, automatic certificates,
security headers and a Content-Security-Policy), systemd units (`deploy/systemd/`), production settings, a verification
checklist, and an honest list of what still needs a decision from you (clinical validation, regulation, privacy law).
With `NODE_ENV=production` / `APP_ENV=production` the servers refuse to start on weak or placeholder configuration.

## Tests

```bash
cd frontend    && npm run lint && npm test
cd auth-server && npm test        # starts the real server on a temporary database
cd backend  && pip install -r requirements-dev.txt && python -m pytest
python -m pytest validation       # statistics behind the validation report (numpy only)
python -m pytest calibration      # site threshold-calibration tool (numpy only)
```
The MATLAB tests live in `stage4_explainability/**/test_*.m`; they need the APTOS dataset under `data/` (git-ignored).
CI (`.github/workflows/ci.yml`) runs the frontend, backend and auth-server checks that don't need MATLAB.

## Notes and limitations

- The Stage 2 lesion overlay (MATLAB, `stage2_structure/dl/lesionOverlayToFile.m`, calibrated v2 network) is off by default until its wording is clinically reviewed (`ENABLE_LESION_OVERLAY` / `VITE_ENABLE_LESION_OVERLAY`). It marks *possible* lesions: on held-out test photographs, something in 34% of eyes without retinopathy and 98-100% of eyes with DR; Dice against expert masks 0.45 MA, 0.42 HE, 0.62 EX, 0.51 SE (`validation/results/lesions_dl_Stage2_LesionUNet_v2_calibrated.md`). The old image-processing overlay it replaced painted about 2.7% of every retina (`validation/LESIONS.md`).
- Exam history keeps grades and summaries only; there is no image storage, so a past exam cannot be re-opened visually.
- Health data has one owner (the account). There is no clinician/patient sharing model or audit log yet.
- The model files (`*.mat`) are large binaries tracked directly in git. Consider Git LFS.
- The datasets (`data/`) are not included.
