# Deploying Retina Rescue (HTTPS, production settings)

This guide takes the app from "runs on my laptop" to "reachable on the internet over HTTPS".
**Read [Before you go live](#before-you-go-live) first: some items are not technical.**

```
Internet --https--> Caddy (443)  ── /auth-api/*  ──> auth-server  127.0.0.1:4000
                       │         ── /ml-api/*    ──> ML backend   127.0.0.1:5000 ──(MATLAB)
                       │         ── everything else: frontend/dist (static files)
                       └ /auth-api/internal/* is blocked here (service-to-service only)
```

The web app and both APIs share **one origin**, so there is no CORS to configure and cookies/tokens never cross sites.
Only Caddy listens publicly; both APIs stay bound to `127.0.0.1`.

## 1. What you need
- A Linux server you control, with **MATLAB and its license** installed (Stages 3 and 4) and the MATLAB Engine for Python.
- A domain name whose DNS `A`/`AAAA` record points at the server, with ports **80 and 443** open (Caddy uses 80 for the certificate challenge).
- Node 22.13+, Python 3.12+, and [Caddy 2](https://caddyserver.com/docs/install).

## 2. Build and place the code
```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin retina
sudo -u retina git clone <your repo> /srv/retina-rescue && cd /srv/retina-rescue
( cd frontend    && npm ci && npm run build )     # uses frontend/.env.production: relative /auth-api and /ml-api
( cd auth-server && npm ci --omit=dev )
( cd backend     && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt )
# then install the MATLAB Engine into that venv (see backend/requirements.txt)
```
The trained model `stage_3/Stage3_Final_HighSensitivity_Model.mat` must be present (it is tracked in git).

## 3. Configure (secrets never go in git)
Generate each secret separately, one per line:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

**`auth-server/.env`** (`chmod 600`, owned by `retina`)
```
PORT=4000
CLIENT_ORIGIN=https://retina.yourdomain.org
JWT_SECRET=<secret 1>
DATA_KEY=<secret 2>          # encrypts health data. BACK IT UP. Changing/losing it makes stored data unreadable.
SERVICE_KEY=<secret 3>       # must equal SERVICE_KEY in backend/.env
GMAIL_USER=...               # real email is mandatory in production; verify with: npm run check-email -- --send
GMAIL_APP_PASSWORD=...
```
`NODE_ENV=production` and `TRUST_PROXY=1` are set by the systemd unit.

**`backend/.env`** (`chmod 600`)
```
CLIENT_ORIGINS=https://retina.yourdomain.org
AUTH_SERVER_URL=http://127.0.0.1:4000
SERVICE_KEY=<same as auth-server>
HOST=127.0.0.1
```
`APP_ENV=production` is set by the systemd unit.
Optional: `REFERRAL_THRESHOLD=<0.02-0.60>` overrides the model's 0.20 referral threshold. Set it only from a written clinical decision
based on a site calibration (`calibration/README.md`); the app then reports that the threshold came from the site.

**Both services refuse to start** if a secret is missing, short or still a placeholder; if two secrets are reused;
if the origin is not `https://` or points at localhost; or (backend) if it would bind to a public address.
The message lists every problem at once. In production the ML backend also turns its `/docs` and `/openapi.json` off.

## 4. Run
```bash
sudo cp deploy/systemd/*.service /etc/systemd/system/   # edit User / paths first
sudo systemctl daemon-reload && sudo systemctl enable --now retina-auth retina-ml
# Caddy: edit the two "EDIT" lines in deploy/Caddyfile (domain, e-mail) and the frontend path, then:
caddy validate --config deploy/Caddyfile && sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```
The first request after a restart can take up to a minute while MATLAB loads the network; the API reports
`"matlab":"starting"` on `/ml-api/health` until it is ready.

## 5. Verify (run these from another machine)
```bash
D=https://retina.yourdomain.org
curl -sI  http://retina.yourdomain.org | head -3                       # 308 redirect to https
curl -sI  $D | grep -iE "strict-transport|content-security|x-frame|cache-control"   # security headers, no-cache
curl -s   $D/auth-api/health                                           # {"ok":true}
curl -s   $D/ml-api/health                                             # {"ok":true,"matlab":"ready"}
curl -si  -X POST $D/auth-api/internal/exams | head -1                 # HTTP/2 404  (must NOT be reachable)
curl -s   $D/docs | grep -ci swagger                                   # 0  (the API docs are not exposed)
curl -si  -X POST $D/ml-api/stage1-quality | head -1                   # HTTP/2 401  (needs a session)
```
Then sign up with a real address, confirm the emailed code arrives, run an assessment, and check Exam History.
Test HTTPS quality at <https://www.ssllabs.com/ssltest/> and headers at <https://securityheaders.com>.

## What this setup protects, and what it does not
| Protected | Notes |
|---|---|
| Traffic in transit | TLS via Caddy; HSTS tells browsers to refuse plain HTTP. |
| Health data at rest | Profile and exam payloads are AES-256-GCM encrypted (`DATA_KEY`). Names/emails/password hashes are not field-encrypted; use disk encryption on the server too. |
| Service-to-service endpoint | Blocked at the proxy **and** refused by the auth-server if a request arrived through a proxy. |
| Brute force | Rate limits are per real client IP (`TRUST_PROXY=1` lets the server see it). Set it to the true number of proxies in front. |
| Abuse of uploads | Proxy caps bodies (40 MB ML, 64 KB auth); the app also caps each image at 15 MB. |
| Stale pages | `index.html` is never cached; hashed assets are cached for a year. |

**Known limits**
- **The session is an `HttpOnly` cookie** (`rr_session`, `Secure` and `SameSite=Lax` in production), so page scripts cannot read it. Because browsers send it
  automatically, every request that changes data must also carry `X-Requested-With: retina-rescue` (the app does this); requests without it are refused with 403.
  This relies on the app and both APIs sharing one origin, as the Caddy setup does. If you put the APIs on a different site, the cookie will not be sent.
  Sessions last 7 days and are revoked by logout, password reset and account deletion. After deploying this version everyone has to sign in once again.
- **Fonts are bundled with the app** (Outfit and Plus Jakarta Sans, via `@fontsource`), so visitors' browsers contact no third party for them and the CSP allows only `'self'` for styles and fonts.
- **One MATLAB engine handles one request at a time.** Concurrent assessments queue. That is fine for a clinic; for
  district-scale load you need multiple backend instances (each needs a MATLAB license).
- **SQLite is a single file on one server.** Back up `auth-server/retina-rescue.db*` **and** `DATA_KEY` (separately!) on a schedule, and test a restore. Deleting an account removes it from the live database only; copies in your backups remain until those backups expire, so state that in your privacy policy.
- **Email uses a personal Gmail account (about 500 messages/day).** Use a transactional provider for real traffic.

## Before you go live
These are not code problems, and no configuration substitutes for them:
1. **Clinical validation.** `validation/REPORT.md` is a technical validation on one public dataset (92.4% sensitivity, 89.8% specificity on held-out images; it also documents the model's misses, including 2 of 44 proliferative cases). It is not clinical validation: the model has not been tested on your cameras or patients, and it must not be the sole basis for any decision.
2. **Clinical review of the wording.** No clinician has reviewed what the tool tells patients. `docs/CLINICAL_REVIEW.md` is a ready-made review packet with a sign-off table; get it reviewed before real use.
3. **Regulation.** Software that grades disease from medical images is typically regulated as a medical device (e.g. FDA, EU MDR, India's CDSCO). Check what applies before offering it to patients.
4. **Privacy law and consent.** You will hold health data. Publish a privacy notice, obtain consent, define retention, and get a legal review for your jurisdiction (HIPAA, GDPR, India's DPDP Act, ...).
5. **Operations.** Monitoring/alerting, log retention without personal data, patching, and an incident plan.
