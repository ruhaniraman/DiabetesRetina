# Demo deploy: Vercel (web app) + ngrok (tunnel to the laptop)

For hackathon demos only. The production setup is `DEPLOYMENT.md`.

```
Browser ─> https://<project>.vercel.app ─┬─ web app (static files on Vercel)
                                         ├─ /auth-api/* ─┐  Vercel rewrites (frontend/vercel.json)
                                         └─ /ml-api/*  ──┴─> https://endpoint-widen-blinked.ngrok-free.dev ─> laptop :8080 (deploy/demo-proxy.mjs)
                                                                                   ├─ /auth-api -> auth-server :4000
                                                                                   └─ /ml-api   -> ML backend  :5000 (MATLAB)
```

The browser only ever talks to the Vercel address, so the session cookie works without any CORS or cookie changes.
**The link works only while the laptop runs all four processes and the tunnel.**

## One-time setup

1. **ngrok**: sign up at <https://ngrok.com>, install it (`winget install ngrok.ngrok`), run
   `ngrok config add-authtoken <token>`, and claim your free static domain under *Domains* (e.g. `something.ngrok-free.app`).
2. Put that domain in both `destination`s in `frontend/vercel.json` (currently `endpoint-widen-blinked.ngrok-free.dev`), commit and push.
3. **Vercel**: sign in at <https://vercel.com> with GitHub → *Add New… → Project* → import the repository.
   - Root Directory: `frontend` (framework: Vite, detected).
   - Environment Variables: `VITE_BEHIND_NGROK=true`, and `VITE_ENABLE_LESION_OVERLAY=true` if the backend has the overlay on.
   - Deploy. Every push to `main` redeploys.
4. Optional, `auth-server/.env`: `TRUST_PROXY=1`, so rate limits count each visitor separately (otherwise all visitors share one limit).

## Each time you demo

Four terminals from the repo root:

```bash
cd auth-server && npm run dev            # :4000   (FIXED_OTP=123456 in .env for demo sign-ups)
cd backend && python server.py           # :5000   (wait for "matlab": "ready" on /api/health)
node deploy/demo-proxy.mjs               # :8080
ngrok http --url=endpoint-widen-blinked.ngrok-free.dev 8080
```

Check: `https://endpoint-widen-blinked.ngrok-free.dev/proxy-health` and `https://<project>.vercel.app/ml-api/health`.
The frontend dev server (:5173) is not needed.

## Notes

- One MATLAB engine serves one request at a time; several judges at once will queue.
- If the tunnel is down the app shows network errors; restart `ngrok`.
- `/auth-api/internal*` is refused by the proxy (service-to-service only), as in the Caddy setup.
