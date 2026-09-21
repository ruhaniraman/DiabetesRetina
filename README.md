# Retina Rescue: diabetic retinopathy screening

A screening aid that grades diabetic retinopathy (DR) from fundus photographs of both eyes.

> **Screening aid only.** Output is produced by automated image analysis. It is not a medical diagnosis and must be
> reviewed by a qualified eye-care professional.

## Architecture

```
frontend/       React + Vite web app (port 5173)
auth-server/    Node/Express: sign-up, email verification, login, sessions (port 4000, SQLite via node:sqlite)
backend/        Python/FastAPI: image analysis API (port 5000)
   ├─ Stage 1  image quality check           OpenCV
   ├─ Stage 2  lesion overlay (EXPERIMENTAL, off by default: validation/LESIONS.md shows it does not detect lesions)
   ├─ Stage 3  bilateral DR grading          MATLAB Engine → trained network (stage_3/)
   └─ Stage 4  Grad-CAM explainability       MATLAB Engine → stage4_explainability/
stage1_quality/ stage2_structure/ stage_3/ stage4_explainability/ stage5_simulink/ utils/   MATLAB source
```

The browser talks to both servers. The Python backend never sees passwords or the JWT secret: it forwards each
request's bearer token to the auth-server (`GET /api/auth/me`) and rejects the request unless that succeeds, so
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
With `GMAIL_USER` / `GMAIL_APP_PASSWORD` unset, verification and password-reset codes are printed in this terminal
instead of emailed. That is for development only; see [Email setup](#email-setup) to send real mail.

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

1. Create an account and verify your email, then sign in. Forgot your password? Use **Forgot password?** on the sign-in page:
   you'll get a 6-digit code by email, choose a new password, and every existing session is signed out.
2. Complete the patient profile (edit icon in "My Health Record"). It is saved to your account, so it is there next time you sign in.
3. Upload a fundus photo for each eye. Each is quality-checked; rejected images must be replaced.
4. **Run AI Assessment**, then open **Detailed Report** for per-eye grades, lesion candidates and the Grad-CAM heatmap.
   Each assessment is saved to **Exam History** on the dashboard.

## Health data: what is stored

| Stored (per user) | Not stored |
|---|---|
| Patient profile: name, date of birth, gender, blood group, diabetes duration, blood pressure, HbA1c, fasting sugar | Retinal photographs (they are analysed in memory and discarded) |
| Each assessment: date, per-eye grade and confidence, overall grade, summary text | Grad-CAM heatmaps and lesion overlays |

- **Encrypted at rest.** Profile and exam payloads are AES-256-GCM encrypted with `DATA_KEY` before they reach SQLite, so a
  copied database file is unreadable without the key (and tampering is detected). The account name, email and login data are
  ordinary columns. **Back up `DATA_KEY` and never change it:** existing data cannot be decrypted without it.
- **Exam results come from the model, not the browser.** The ML backend saves each result itself using `SERVICE_KEY`
  (the same value in `auth-server/.env` and `backend/.env`); a signed-in user cannot write to their own history.
- **Users control their data.** They can delete a single exam, or all their health data, from the app
  (`DELETE /api/patient/exams/:id`, `DELETE /api/patient/data`).
- If `SERVICE_KEY` is unset, assessments still work but are not saved (the dashboard says so).
- This is not a compliance certification. For real patient data you still need consent, an access/audit policy, backups,
  TLS, and a legal review for your jurisdiction (e.g. HIPAA, GDPR, India's DPDP Act).

## Email setup

Sign-up verification and password reset both send a 6-digit code by email through a Gmail account.

1. In the Google account that will *send* the mail, turn on 2-Step Verification.
2. Create an App Password at <https://myaccount.google.com/apppasswords> (a 16-character code; not your normal password).
3. Put it in `auth-server/.env` (never commit that file):
   ```
   GMAIL_USER=your.address@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   ```
4. Check it works, then restart the auth-server:
   ```bash
   cd auth-server
   npm run check-email             # logs in to Gmail, sends nothing
   npm run check-email -- --send   # also emails a test message to GMAIL_USER
   ```
The server prints which mode it is in at startup. With `NODE_ENV=production` it refuses to start unless Gmail is configured.
Gmail limits how much a personal account may send (about 500 messages/day), so use a transactional email provider
(e.g. SES, Postmark) if you expect real traffic.

## Model validation

`validation/REPORT.md` is a held-out evaluation of the Stage 3 model (sensitivity, specificity, AUC, kappa with confidence
intervals, threshold behaviour, a data-leakage audit, and a plain statement of what it does *not* show). It found and fixed two
problems in the app: the wrong image preprocessing, and a decision rule that ignored the model's tuned referral threshold.
Headline: on 548 unseen images the referral decision flags 92.4% of referable patients at 89.8% specificity; the exact stage is
much less reliable (78% correct). On a second public dataset (IDRiD) sensitivity held (94.4%) but specificity fell to 46%, so performance depends on
the camera and population. `validation/QUALITY.md` covers the Stage 1 photo-quality gate, which was rebuilt after validation showed the old one
rejected good full-resolution photos and claimed to "enhance" images it never touched. This is an internal technical validation, **not** clinical
validation. Reproduce it with `validation/README.md`.

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
```
The MATLAB tests live in `stage4_explainability/**/test_*.m`; they need the APTOS dataset under `data/` (git-ignored).
CI (`.github/workflows/ci.yml`) runs the frontend, backend and auth-server checks that don't need MATLAB.

## Notes and limitations

- The Stage 2 lesion overlay is disabled by default: it paints about 2.7% of every retina (healthy or not) and misses annotated lesions (`validation/LESIONS.md`).
- Exam history keeps grades and summaries only; there is no image storage, so a past exam cannot be re-opened visually.
- Health data has one owner (the account). There is no clinician/patient sharing model or audit log yet.
- The model files (`*.mat`) are large binaries tracked directly in git. Consider Git LFS.
- The datasets (`data/`) are not included.
