import 'dotenv/config'; // must stay the first import
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { createInternalRouter, createPatientRouter, deleteReportsOfUser } from './health.js';
import { createVault } from './vault.js';
import { productionProblems, trustProxySetting } from './prodcheck.js';
import { sendCodeSms } from './sms.js';

/* ------------------------------ Config ------------------------------ */

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;
// Demo/development only: every verification and reset code is this value and no SMS is sent. Blocked in production.
const FIXED_OTP = process.env.FIXED_OTP?.trim() || null;
if (FIXED_OTP && !/^\d{6}$/.test(FIXED_OTP)) {
  console.error('FIXED_OTP must be exactly 6 digits.');
  process.exit(1);
}

if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET. Copy .env.example to .env and set it.');
  process.exit(1);
}

// In production, refuse to start with missing, weak or placeholder settings rather than fail later.
if (process.env.NODE_ENV === 'production') {
  const problems = productionProblems(process.env);
  if (problems.length) {
    console.error(['Refusing to start in production:', ...problems.map((p) => `  - ${p}`)].join('\n'));
    process.exit(1);
  }
}

// Health data is encrypted at rest with DATA_KEY. Falling back to a key derived from JWT_SECRET keeps development
// easy, but rotating JWT_SECRET would then make stored data unreadable, so production must set DATA_KEY.
const DATA_KEY = process.env.DATA_KEY;
if (!DATA_KEY) {
  console.warn('DATA_KEY is not set; deriving the encryption key from JWT_SECRET (development only).');
}
const vault = createVault(DATA_KEY || `health-data:${JWT_SECRET}`);
const SERVICE_KEY = process.env.SERVICE_KEY; // shared with the ML backend so it can record exam results

const CODE_TTL_MS = 10 * 60 * 1000; // verification / reset code lifetime
const RESEND_COOLDOWN_MS = 60 * 1000; // minimum gap between SMS codes
const MAX_CODE_ATTEMPTS = 5;

// Compared against when the number doesn't exist, so response time doesn't leak which numbers are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

/* ----------------------------- Helpers ------------------------------ */

// Mobile numbers are stored in E.164 form (+<country code><number>). A bare 10-digit number is taken as Indian (+91).
const PHONE_RE = /^\+[1-9]\d{7,14}$/;
function normalizePhone(v) {
  const s = String(v ?? '').replace(/[\s\-().]/g, '');
  if (/^\d{10}$/.test(s)) return `+91${s}`;
  if (/^0\d{10}$/.test(s)) return `+91${s.slice(1)}`;
  if (/^91\d{10}$/.test(s)) return `+${s}`;
  if (s.startsWith('00')) return `+${s.slice(2)}`;
  return s;
}

function passwordError(pw) {
  if (!pw) return 'Password is required.';
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (Buffer.byteLength(pw) > 72) return 'Password is too long (72 characters max).';
  if (!/[A-Z]/.test(pw)) return 'Password needs an uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password needs a lowercase letter.';
  if (!/\d/.test(pw)) return 'Password needs a number.';
  return '';
}

const publicUser = (u) => ({ id: u.id, fullName: u.full_name, phone: u.phone });
// `sub` is a string (per the JWT spec); `v` lets logout revoke every token issued before it.
const signToken = (user) =>
  jwt.sign({ sub: String(user.id), v: user.token_version ?? 0 }, JWT_SECRET, { expiresIn: '7d' });

// The browser keeps the session in an HttpOnly cookie, so page scripts (and any injected script) cannot read the token.
// The token is also accepted as a Bearer header for non-browser clients.
const SESSION_COOKIE = 'rr_session';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const CSRF_HEADER_VALUE = 'retina-rescue';
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
const startSession = (res, user) => {
  const token = signToken(user);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_MS });
  return token;
};
const endSessionCookie = (res) => res.clearCookie(SESSION_COOKIE, cookieOptions());
function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// `purpose` keeps verification and reset codes from being interchangeable.
const hashCode = (phone, code, purpose = '') =>
  crypto.createHmac('sha256', JWT_SECRET).update(`${purpose}${phone}:${code}`).digest('hex');

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

const newCode = () => FIXED_OTP || crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

// Generates a fresh 6-digit code, stores its hash, and texts the plain code (unless FIXED_OTP is set).
async function issueVerificationCode(user) {
  const code = newCode();
  const now = Date.now();
  db.prepare(
    `UPDATE users
        SET verification_code_hash = ?, verification_expires_at = ?,
            verification_attempts = 0, verification_sent_at = ?
      WHERE id = ?`
  ).run(hashCode(user.phone, code), now + CODE_TTL_MS, now, user.id);

  if (!FIXED_OTP) await sendCodeSms(user.phone, code, 'Verification code');
}

// Same idea for password reset, stored in the reset_* columns.
async function issueResetCode(user) {
  const code = newCode();
  const now = Date.now();
  db.prepare(
    `UPDATE users
        SET reset_code_hash = ?, reset_expires_at = ?, reset_attempts = 0, reset_sent_at = ?
      WHERE id = ?`
  ).run(hashCode(user.phone, code, 'reset:'), now + CODE_TTL_MS, now, user.id);

  if (!FIXED_OTP) await sendCodeSms(user.phone, code, 'Password reset code');
}

const cooldownRemainingMs = (user) =>
  Math.max(0, (user.verification_sent_at || 0) + RESEND_COOLDOWN_MS - Date.now());
const resetCooldownRemainingMs = (user) =>
  Math.max(0, (user.reset_sent_at || 0) + RESEND_COOLDOWN_MS - Date.now());

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || readCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ message: 'Not signed in.' });
  // A cookie is sent automatically by the browser, so a request that changes data must also carry a header that a
  // cross-site page cannot add (SameSite=Lax already blocks most cross-site requests; this is the second layer).
  if (!bearer && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== CSRF_HEADER_VALUE) {
    return res.status(403).json({ message: 'Missing request header.' });
  }

  try {
    const { sub, v } = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_verified = 1').get(sub);
    if (!user || (v ?? 0) !== user.token_version) return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired. Please sign in again.' });
  }
}

/* ------------------------------- App -------------------------------- */

const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy, req.ip must come from X-Forwarded-For or every user shares one rate-limit bucket.
app.set('trust proxy', trustProxySetting(process.env));
app.use(helmet());
// Responses carry health data and session state: never let a browser or proxy cache them.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10kb' }));

// One limiter per route so a burst on one endpoint doesn't lock users out of the others.
const makeLimiter = (limit) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again in a few minutes.' },
  });
const signupLimiter = makeLimiter(20);
const verifyLimiter = makeLimiter(30);
const resendLimiter = makeLimiter(20);
const loginLimiter = makeLimiter(30);
const forgotLimiter = makeLimiter(10);
const resetLimiter = makeLimiter(20);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* ------------------------------ Sign up ----------------------------- */

app.post('/api/auth/signup', signupLimiter, async (req, res) => {
  const fullName = String(req.body?.fullName ?? '').trim();
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password ?? '');

  const errors = {};
  if (fullName.length < 2) errors.fullName = 'Enter your full name.';
  if (!PHONE_RE.test(phone)) errors.phone = 'Enter a valid mobile number.';
  const pwErr = passwordError(password);
  if (pwErr) errors.password = pwErr;

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please fix the highlighted fields.', errors });
  }

  // 1. Does this user already exist?
  const existing = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (existing?.is_verified) {
    return res.status(409).json({
      message: 'An account with this mobile number already exists.',
      errors: { phone: 'An account with this mobile number already exists. Try signing in.' },
    });
  }

  // 2. A pending (unverified) sign-up whose code is still valid must not be overwritten: otherwise
  //    anyone could re-register the victim's number with their own password, and the victim would then
  //    verify an account the attacker controls. Send them to the verify screen instead; the code that
  //    was already texted still works and "Resend code" is available.
  if (existing && Date.now() < (existing.verification_expires_at || 0)) {
    return res.status(201).json({ message: 'A verification code was already sent to this number.', phone });
  }

  // 3. New user, or an earlier sign-up whose code expired: (re)save details and send a code.
  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  if (existing) {
    db.prepare('UPDATE users SET full_name = ?, password_hash = ? WHERE id = ?').run(fullName, passwordHash, existing.id);
    user = { ...existing, full_name: fullName };
  } else {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (full_name, phone, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(fullName, phone, passwordHash, Date.now());
    user = { id: lastInsertRowid, full_name: fullName, phone };
  }

  try {
    await issueVerificationCode(user);
  } catch (err) {
    console.error('Failed to send verification code:', err);
    return res.status(502).json({ message: "We couldn't send the verification code. Please try again." });
  }

  res.status(201).json({ message: 'Verification code sent.', phone });
});

/* --------------------------- Verify phone --------------------------- */

app.post('/api/auth/verify-phone', verifyLimiter, (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code ?? '').trim();

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Enter the 6-digit code sent to your phone.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) return res.status(400).json({ message: 'Invalid or expired code. Request a new one.' });
  if (user.is_verified) return res.status(409).json({ message: 'This number is already verified. Please sign in.' });
  if (!user.verification_code_hash || Date.now() > user.verification_expires_at) {
    return res.status(400).json({ message: 'That code has expired. Request a new one.' });
  }
  if (user.verification_attempts >= MAX_CODE_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' });
  }

  if (!safeEqual(hashCode(phone, code), user.verification_code_hash)) {
    db.prepare('UPDATE users SET verification_attempts = verification_attempts + 1 WHERE id = ?').run(user.id);
    const left = MAX_CODE_ATTEMPTS - user.verification_attempts - 1;
    return res.status(400).json({
      message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new one.',
    });
  }

  db.prepare(
    `UPDATE users
        SET is_verified = 1, verification_code_hash = NULL,
            verification_expires_at = NULL, verification_attempts = 0
      WHERE id = ?`
  ).run(user.id);

  res.json({ token: startSession(res, user), user: publicUser(user) });
});

/* ---------------------------- Resend code --------------------------- */

app.post('/api/auth/resend-code', resendLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

  // Same answer whether or not the account exists.
  if (!user || user.is_verified) {
    return res.json({ message: 'If that account is awaiting verification, a new code has been sent.' });
  }

  const wait = cooldownRemainingMs(user);
  if (wait > 0) {
    const retryAfter = Math.ceil(wait / 1000);
    return res.status(429).json({ message: `Please wait ${retryAfter}s before requesting another code.`, retryAfter });
  }

  try {
    await issueVerificationCode(user);
  } catch (err) {
    console.error('Failed to resend verification code:', err);
    return res.status(502).json({ message: "We couldn't send the verification code. Please try again." });
  }
  res.json({ message: 'A new code has been sent.' });
});

/* ------------------------------ Sign in ----------------------------- */

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const password = String(req.body?.password ?? '');

  if (!PHONE_RE.test(phone) || !password) {
    return res.status(400).json({ message: 'Enter your mobile number and password.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  // One generic message for "no such user" and "wrong password".
  if (!user || !passwordOk) {
    return res.status(401).json({ message: 'Incorrect mobile number or password.' });
  }

  if (!user.is_verified) {
    // Send a fresh code if the last one is old enough, then point the client at the verify screen.
    if (cooldownRemainingMs(user) === 0) {
      try {
        await issueVerificationCode(user);
      } catch (err) {
        console.error('Failed to send verification code on login:', err);
      }
    }
    return res.status(403).json({
      code: 'PHONE_NOT_VERIFIED',
      message: 'Please verify your mobile number to continue.',
      phone: user.phone,
    });
  }

  res.json({ token: startSession(res, user), user: publicUser(user) });
});

/* ------------------------- Forgot / reset password ------------------------ */

const FORGOT_REPLY = { message: 'If an account exists for that number, a reset code has been sent.' };

// Always answers the same way, so the endpoint can't be used to discover which numbers are registered.
app.post('/api/auth/forgot-password', forgotLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!PHONE_RE.test(phone)) return res.status(400).json({ message: 'Enter a valid mobile number.' });

  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (user && resetCooldownRemainingMs(user) === 0) {
    try {
      await issueResetCode(user);
    } catch (err) {
      console.error('Failed to send password reset code:', err); // logged, but not revealed to the caller
    }
  }
  res.json(FORGOT_REPLY);
});

app.post('/api/auth/reset-password', resetLimiter, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Enter the 6-digit code sent to your phone.' });
  }
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ message: pwErr, errors: { password: pwErr } });

  const INVALID = { message: 'Invalid or expired code. Request a new one.' };
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !user.reset_code_hash || Date.now() > (user.reset_expires_at || 0)) {
    return res.status(400).json(INVALID);
  }
  if (user.reset_attempts >= MAX_CODE_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' });
  }

  if (!safeEqual(hashCode(phone, code, 'reset:'), user.reset_code_hash)) {
    db.prepare('UPDATE users SET reset_attempts = reset_attempts + 1 WHERE id = ?').run(user.id);
    const left = MAX_CODE_ATTEMPTS - user.reset_attempts - 1;
    return res.status(400).json({
      message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new one.',
    });
  }

  // The code proves control of the phone, so this also verifies an account that never finished sign-up.
  // Bumping token_version signs the account out everywhere (e.g. after a suspected compromise).
  const passwordHash = await bcrypt.hash(password, 12);
  db.prepare(
    `UPDATE users
        SET password_hash = ?, is_verified = 1, token_version = token_version + 1,
            reset_code_hash = NULL, reset_expires_at = NULL, reset_attempts = 0,
            verification_code_hash = NULL, verification_expires_at = NULL, verification_attempts = 0
      WHERE id = ?`
  ).run(passwordHash, user.id);

  res.json({ message: 'Password updated. Please sign in with your new password.' });
});

/* -------------------------- Current session ------------------------- */

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ------------------------------ Sign out ---------------------------- */

// Bumping token_version invalidates every token issued so far (all devices).
app.post('/api/auth/logout', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET token_version = token_version + 1 WHERE id = ?').run(req.user.id);
  endSessionCookie(res);
  res.json({ message: 'Signed out.' });
});

/* --------------------------- Delete account --------------------------- */

const deleteLimiter = makeLimiter(5);

// Erases the account and everything stored for it (profile, exam history). Needs the password again, so a stolen
// session token alone cannot do it. Irreversible: there is no soft delete and no copy is kept.
app.delete('/api/auth/account', deleteLimiter, requireAuth, async (req, res) => {
  const password = String(req.body?.password ?? '');
  if (!password) return res.status(400).json({ message: 'Enter your password to delete your account.' });
  if (!(await bcrypt.compare(password, req.user.password_hash))) {
    return res.status(403).json({ message: 'Incorrect password.' });
  }
  db.exec('BEGIN');
  try {
    deleteReportsOfUser(req.user.id);
    db.prepare('DELETE FROM exams WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM patient_profiles WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  endSessionCookie(res);
  res.json({ message: 'Your account and all its data have been deleted.' });
});

/* ------------------------------ Health data ------------------------------ */

app.use('/api/patient', makeLimiter(300), requireAuth, createPatientRouter({ vault }));
app.use('/api/internal', createInternalRouter({ vault, serviceKey: SERVICE_KEY }));

/* ----------------------------- Fallbacks ---------------------------- */

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Retina Rescue API running on http://localhost:${PORT}`);
  console.log(
    FIXED_OTP
      ? `SMS: OFF. FIXED_OTP is set, so every verification and reset code is ${FIXED_OTP} (demo only).`
      : 'SMS: NOT configured. Codes are printed to this console instead of being texted (development only).'
  );
});
