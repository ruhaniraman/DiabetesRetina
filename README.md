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
   ├─ Stage 2  lesion candidate mapping      OpenCV (heuristic; NOT the neural network)
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
2. Optionally complete the patient profile (edit icon in "My Health Record"). It is kept only for the browser session.
3. Upload a fundus photo for each eye. Each is quality-checked; rejected images must be replaced.
4. **Run AI Assessment**, then open **Detailed Report** for per-eye grades, lesion candidates and the Grad-CAM heatmap.

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

## Tests

```bash
cd frontend    && npm run lint && npm test
cd auth-server && npm test        # starts the real server on a temporary database
cd backend  && pip install -r requirements-dev.txt && python -m pytest
```
The MATLAB tests live in `stage4_explainability/**/test_*.m`; they need the APTOS dataset under `data/` (git-ignored).
CI (`.github/workflows/ci.yml`) runs the frontend, backend and auth-server checks that don't need MATLAB.

## Notes and limitations

- Stage 2 lesion counts come from classic image processing and are unverified candidates, not neural-network findings.
- Patient details are not stored server-side; nothing about exam history persists between sessions yet.
- The model files (`*.mat`) are large binaries tracked directly in git. Consider Git LFS.
- The datasets (`data/`) are not included.
