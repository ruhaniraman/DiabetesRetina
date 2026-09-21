// Integration tests: start the real server on a throwaway database and call it over HTTP.
// Run with `npm test`. No Gmail needed: verification/reset codes are read from the dev console output.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 4300 + Math.floor(Math.random() * 500);
const API = `http://127.0.0.1:${PORT}/api`;

let server;
let tmp;
let output = '';

async function post(route, body, token) {
  const res = await fetch(`${API}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const me = (token) => fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);

// Codes are printed to the server's stdout in development mode.
async function latestCode(label, email) {
  const re = new RegExp(`${label} for ${email.replace(/[.+]/g, '\\$&')}: (\\d{6})`, 'g');
  for (let i = 0; i < 40; i += 1) {
    const found = [...output.matchAll(re)];
    if (found.length) return found.at(-1)[1];
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`No "${label}" line for ${email} in server output`);
}
const verificationCode = (email) => latestCode('Verification code', email);
const resetCode = (email) => latestCode('Password reset code', email);

async function signUpVerified(email, password) {
  await post('/auth/signup', { fullName: 'Test User', email, password });
  const { body } = await post('/auth/verify-email', { email, code: await verificationCode(email) });
  return body.token;
}

before(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'rr-auth-'));
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: path.join(tmp, 'test.db'),
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      GMAIL_USER: '',
      GMAIL_APP_PASSWORD: '',
      NODE_ENV: 'development',
    },
  });
  server.stdout.on('data', (d) => { output += d; });
  server.stderr.on('data', (d) => { output += d; });
  for (let i = 0; i < 100; i += 1) {
    if (output.includes('running on')) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not start:\n${output}`);
});

after(() => {
  server?.kill();
  setTimeout(() => rmSync(tmp, { recursive: true, force: true }), 300);
});

describe('sign-up and sessions', () => {
  it('signs up, verifies by code, and returns a working session', async () => {
    const token = await signUpVerified('a@example.com', 'Password1');
    assert.equal(await me(token), 200);
  });

  it('logout revokes the token', async () => {
    const token = await signUpVerified('b@example.com', 'Password1');
    assert.equal((await post('/auth/logout', {}, token)).status, 200);
    assert.equal(await me(token), 401);
  });

  it('does not let a stranger overwrite a pending sign-up', async () => {
    const email = 'pending@example.com';
    await post('/auth/signup', { fullName: 'Owner', email, password: 'Owner1234' });
    const code = await verificationCode(email);
    await post('/auth/signup', { fullName: 'Evil', email, password: 'Attack1234' });
    assert.equal((await post('/auth/login', { email, password: 'Attack1234' })).status, 401);
    assert.equal((await post('/auth/verify-email', { email, code })).status, 200);
    assert.equal((await post('/auth/login', { email, password: 'Owner1234' })).status, 200);
  });
});

describe('password reset', () => {
  it('gives the same answer for unknown and known emails', async () => {
    await signUpVerified('known@example.com', 'Password1');
    const known = await post('/auth/forgot-password', { email: 'known@example.com' });
    const unknown = await post('/auth/forgot-password', { email: 'nobody@example.com' });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
  });

  it('resets the password, signs out old sessions, and the new password works', async () => {
    const email = 'reset@example.com';
    const oldToken = await signUpVerified(email, 'OldPassword1');
    await post('/auth/forgot-password', { email });
    const res = await post('/auth/reset-password', { email, code: await resetCode(email), password: 'NewPassword2' });
    assert.equal(res.status, 200);

    assert.equal(await me(oldToken), 401, 'old sessions are revoked');
    assert.equal((await post('/auth/login', { email, password: 'OldPassword1' })).status, 401);
    assert.equal((await post('/auth/login', { email, password: 'NewPassword2' })).status, 200);
  });

  it('a reset code cannot be used twice', async () => {
    const email = 'once@example.com';
    await signUpVerified(email, 'Password1');
    await post('/auth/forgot-password', { email });
    const code = await resetCode(email);
    assert.equal((await post('/auth/reset-password', { email, code, password: 'Another123' })).status, 200);
    assert.equal((await post('/auth/reset-password', { email, code, password: 'Third12345' })).status, 400);
  });

  it('rejects wrong codes and locks the code after 5 attempts', async () => {
    const email = 'lock@example.com';
    await signUpVerified(email, 'Password1');
    await post('/auth/forgot-password', { email });
    const real = await resetCode(email);
    const wrong = real === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      assert.equal((await post('/auth/reset-password', { email, code: wrong, password: 'Whatever123' })).status, 400);
    }
    // Even the correct code is refused now; a new one must be requested.
    assert.equal((await post('/auth/reset-password', { email, code: real, password: 'Whatever123' })).status, 429);
  });

  it('enforces the password rules and does not burn an attempt on them', async () => {
    const email = 'weak@example.com';
    await signUpVerified(email, 'Password1');
    await post('/auth/forgot-password', { email });
    const code = await resetCode(email);
    assert.equal((await post('/auth/reset-password', { email, code, password: 'short' })).status, 400);
    assert.equal((await post('/auth/reset-password', { email, code, password: 'Strong1234' })).status, 200);
  });

  it('a verification code cannot be used as a reset code', async () => {
    const email = 'cross@example.com';
    await post('/auth/signup', { fullName: 'Cross User', email, password: 'Password1' });
    const verifyCode = await verificationCode(email);
    await post('/auth/forgot-password', { email });
    await resetCode(email); // wait until the reset code exists
    const res = await post('/auth/reset-password', { email, code: verifyCode, password: 'Another123' });
    assert.equal(res.status, 400);
  });

  it('lets someone who never finished sign-up recover, and verifies them', async () => {
    const email = 'never-verified@example.com';
    await post('/auth/signup', { fullName: 'Typo', email, password: 'Mistyped1' });
    await post('/auth/forgot-password', { email });
    const res = await post('/auth/reset-password', { email, code: await resetCode(email), password: 'Correct123' });
    assert.equal(res.status, 200);
    assert.equal((await post('/auth/login', { email, password: 'Correct123' })).status, 200);
  });
});
