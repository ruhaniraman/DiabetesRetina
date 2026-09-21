import 'dotenv/config'; // must stay the first import
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { isMailConfigured, sendPasswordResetEmail, sendVerificationEmail } from './mailer.js';

/* ------------------------------ Config ------------------------------ */

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET;
const REQUIRE_GMAIL = process.env.REQUIRE_GMAIL === 'true';

if (!JWT_SECRET) {
  console.error('Missing JWT_SECRET. Copy .env.example to .env and set it.');
  process.exit(1);
}

// In production, refuse to start rather than fail on the first sign-up.
if (process.env.NODE_ENV === 'production' && !isMailConfigured()) {
  console.error('GMAIL_USER and GMAIL_APP_PASSWORD must be set when NODE_ENV=production.');
  process.exit(1);
}

const CODE_TTL_MS = 10 * 60 * 1000; // verification / reset code lifetime
const RESEND_COOLDOWN_MS = 60 * 1000; // minimum gap between emails
const MAX_CODE_ATTEMPTS = 5;

// Compared against when the email doesn't exist, so response time doesn't leak which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

/* ----------------------------- Helpers ------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const isGmail = (email) => /@(gmail|googlemail)\.com$/i.test(email);
const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();

function passwordError(pw) {
  if (!pw) return 'Password is required.';
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (Buffer.byteLength(pw) > 72) return 'Password is too long (72 characters max).';
  if (!/[A-Z]/.test(pw)) return 'Password needs an uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Password needs a lowercase letter.';
  if (!/\d/.test(pw)) return 'Password needs a number.';
  return '';
}

const publicUser = (u) => ({ id: u.id, fullName: u.full_name, email: u.email });
// `sub` is a string (per the JWT spec); `v` lets logout revoke every token issued before it.
const signToken = (user) =>
  jwt.sign({ sub: String(user.id), v: user.token_version ?? 0 }, JWT_SECRET, { expiresIn: '7d' });

// `purpose` keeps verification and reset codes from being interchangeable.
const hashCode = (email, code, purpose = '') =>
  crypto.createHmac('sha256', JWT_SECRET).update(`${purpose}${email}:${code}`).digest('hex');

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Generates a fresh 6-digit code, stores its hash, and emails the plain code.
async function issueVerificationCode(user) {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const now = Date.now();
  db.prepare(
    `UPDATE users
        SET verification_code_hash = ?, verification_expires_at = ?,
            verification_attempts = 0, verification_sent_at = ?
      WHERE id = ?`
  ).run(hashCode(user.email, code), now + CODE_TTL_MS, now, user.id);

  await sendVerificationEmail(user.email, user.full_name, code);
}

// Same idea for password reset, stored in the reset_* columns.
async function issueResetCode(user) {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const now = Date.now();
  db.prepare(
    `UPDATE users
        SET reset_code_hash = ?, reset_expires_at = ?, reset_attempts = 0, reset_sent_at = ?
      WHERE id = ?`
  ).run(hashCode(user.email, code, 'reset:'), now + CODE_TTL_MS, now, user.id);

  await sendPasswordResetEmail(user.email, user.full_name, code);
}

const cooldownRemainingMs = (user) =>
  Math.max(0, (user.verification_sent_at || 0) + RESEND_COOLDOWN_MS - Date.now());
const resetCooldownRemainingMs = (user) =>
  Math.max(0, (user.reset_sent_at || 0) + RESEND_COOLDOWN_MS - Date.now());

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not signed in.' });

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
app.use(helmet());
app.use(cors({ origin: CLIENT_ORIGIN }));
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
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');

  const errors = {};
  if (fullName.length < 2) errors.fullName = 'Enter your full name.';
  if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  else if (REQUIRE_GMAIL && !isGmail(email)) errors.email = 'Please use a Gmail address (@gmail.com).';
  const pwErr = passwordError(password);
  if (pwErr) errors.password = pwErr;

  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please fix the highlighted fields.', errors });
  }

  // 1. Does this user already exist?
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing?.is_verified) {
    return res.status(409).json({
      message: 'An account with this email already exists.',
      errors: { email: 'An account with this email already exists. Try signing in.' },
    });
  }

  // 2. A pending (unverified) sign-up whose code is still valid must not be overwritten: otherwise
  //    anyone could re-register the victim's email with their own password, and the victim would then
  //    verify an account the attacker controls. Send them to the verify screen instead; the code that
  //    was already emailed still works and "Resend code" is available.
  if (existing && Date.now() < (existing.verification_expires_at || 0)) {
    return res.status(201).json({ message: 'A verification code was already sent to this email.', email });
  }

  // 3. New user, or an earlier sign-up whose code expired: (re)save details and send a code.
  const passwordHash = await bcrypt.hash(password, 12);
  let user;
  if (existing) {
    db.prepare('UPDATE users SET full_name = ?, password_hash = ? WHERE id = ?').run(fullName, passwordHash, existing.id);
    user = { ...existing, full_name: fullName };
  } else {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO users (full_name, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(fullName, email, passwordHash, Date.now());
    user = { id: lastInsertRowid, full_name: fullName, email };
  }

  try {
    await issueVerificationCode(user);
  } catch (err) {
    console.error('Failed to send verification email:', err);
    return res.status(502).json({ message: "We couldn't send the verification email. Please try again." });
  }

  res.status(201).json({ message: 'Verification code sent.', email });
});

/* --------------------------- Verify email --------------------------- */

app.post('/api/auth/verify-email', verifyLimiter, (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? '').trim();

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Enter the 6-digit code from your email.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(400).json({ message: 'Invalid or expired code. Request a new one.' });
  if (user.is_verified) return res.status(409).json({ message: 'This email is already verified. Please sign in.' });
  if (!user.verification_code_hash || Date.now() > user.verification_expires_at) {
    return res.status(400).json({ message: 'That code has expired. Request a new one.' });
  }
  if (user.verification_attempts >= MAX_CODE_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' });
  }

  if (!safeEqual(hashCode(email, code), user.verification_code_hash)) {
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

  res.json({ token: signToken(user), user: publicUser(user) });
});

/* ---------------------------- Resend code --------------------------- */

app.post('/api/auth/resend-code', resendLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

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
    console.error('Failed to resend verification email:', err);
    return res.status(502).json({ message: "We couldn't send the verification email. Please try again." });
  }
  res.json({ message: 'A new code has been sent.' });
});

/* ------------------------------ Sign in ----------------------------- */

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? '');

  if (!EMAIL_RE.test(email) || !password) {
    return res.status(400).json({ message: 'Enter your email and password.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  // One generic message for "no such user" and "wrong password".
  if (!user || !passwordOk) {
    return res.status(401).json({ message: 'Incorrect email or password.' });
  }

  if (!user.is_verified) {
    // Send a fresh code if the last one is old enough, then point the client at the verify screen.
    if (cooldownRemainingMs(user) === 0) {
      try {
        await issueVerificationCode(user);
      } catch (err) {
        console.error('Failed to send verification email on login:', err);
      }
    }
    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email to continue.',
      email: user.email,
    });
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

/* ------------------------- Forgot / reset password ------------------------ */

const FORGOT_REPLY = { message: 'If an account exists for that email, a reset code has been sent.' };

// Always answers the same way, so the endpoint can't be used to discover which emails are registered.
app.post('/api/auth/forgot-password', forgotLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && resetCooldownRemainingMs(user) === 0) {
    try {
      await issueResetCode(user);
    } catch (err) {
      console.error('Failed to send password reset email:', err); // logged, but not revealed to the caller
    }
  }
  res.json(FORGOT_REPLY);
});

app.post('/api/auth/reset-password', resetLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: 'Enter the 6-digit code from your email.' });
  }
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ message: pwErr, errors: { password: pwErr } });

  const INVALID = { message: 'Invalid or expired code. Request a new one.' };
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !user.reset_code_hash || Date.now() > (user.reset_expires_at || 0)) {
    return res.status(400).json(INVALID);
  }
  if (user.reset_attempts >= MAX_CODE_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' });
  }

  if (!safeEqual(hashCode(email, code, 'reset:'), user.reset_code_hash)) {
    db.prepare('UPDATE users SET reset_attempts = reset_attempts + 1 WHERE id = ?').run(user.id);
    const left = MAX_CODE_ATTEMPTS - user.reset_attempts - 1;
    return res.status(400).json({
      message: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Incorrect code. Request a new one.',
    });
  }

  // The code proves control of the mailbox, so this also verifies an account that never finished sign-up.
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
  res.json({ message: 'Signed out.' });
});

/* ----------------------------- Fallbacks ---------------------------- */

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Retina Rescue API running on http://localhost:${PORT}`);
  console.log(
    isMailConfigured()
      ? `Email: sending through Gmail as ${process.env.GMAIL_USER}`
      : 'Email: NOT configured. Codes are printed to this console instead of being emailed (development only).'
  );
});
