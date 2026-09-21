import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './harness.js';

let s;
before(async () => { s = await startServer(); });
after(() => s?.stop());

describe('sign-up and sessions', () => {
  it('signs up, verifies by code, and returns a working session', async () => {
    const token = await s.signUpVerified('a@example.com', 'Password1');
    assert.equal(await s.me(token), 200);
  });

  it('logout revokes the token', async () => {
    const token = await s.signUpVerified('b@example.com', 'Password1');
    assert.equal((await s.post('/auth/logout', {}, token)).status, 200);
    assert.equal(await s.me(token), 401);
  });

  it('does not let a stranger overwrite a pending sign-up', async () => {
    const email = 'pending@example.com';
    await s.post('/auth/signup', { fullName: 'Owner', email, password: 'Owner1234' });
    const code = await s.verificationCode(email);
    await s.post('/auth/signup', { fullName: 'Evil', email, password: 'Attack1234' });
    assert.equal((await s.post('/auth/login', { email, password: 'Attack1234' })).status, 401);
    assert.equal((await s.post('/auth/verify-email', { email, code })).status, 200);
    assert.equal((await s.post('/auth/login', { email, password: 'Owner1234' })).status, 200);
  });
});

describe('password reset', () => {
  it('gives the same answer for unknown and known emails', async () => {
    await s.signUpVerified('known@example.com', 'Password1');
    const known = await s.post('/auth/forgot-password', { email: 'known@example.com' });
    const unknown = await s.post('/auth/forgot-password', { email: 'nobody@example.com' });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
  });

  it('resets the password, signs out old sessions, and the new password works', async () => {
    const email = 'reset@example.com';
    const oldToken = await s.signUpVerified(email, 'OldPassword1');
    await s.post('/auth/forgot-password', { email });
    const res = await s.post('/auth/reset-password', { email, code: await s.resetCode(email), password: 'NewPassword2' });
    assert.equal(res.status, 200);

    assert.equal(await s.me(oldToken), 401, 'old sessions are revoked');
    assert.equal((await s.post('/auth/login', { email, password: 'OldPassword1' })).status, 401);
    assert.equal((await s.post('/auth/login', { email, password: 'NewPassword2' })).status, 200);
  });

  it('a reset code cannot be used twice', async () => {
    const email = 'once@example.com';
    await s.signUpVerified(email, 'Password1');
    await s.post('/auth/forgot-password', { email });
    const code = await s.resetCode(email);
    assert.equal((await s.post('/auth/reset-password', { email, code, password: 'Another123' })).status, 200);
    assert.equal((await s.post('/auth/reset-password', { email, code, password: 'Third12345' })).status, 400);
  });

  it('rejects wrong codes and locks the code after 5 attempts', async () => {
    const email = 'lock@example.com';
    await s.signUpVerified(email, 'Password1');
    await s.post('/auth/forgot-password', { email });
    const real = await s.resetCode(email);
    const wrong = real === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      assert.equal((await s.post('/auth/reset-password', { email, code: wrong, password: 'Whatever123' })).status, 400);
    }
    // Even the correct code is refused now; a new one must be requested.
    assert.equal((await s.post('/auth/reset-password', { email, code: real, password: 'Whatever123' })).status, 429);
  });

  it('enforces the password rules and does not burn an attempt on them', async () => {
    const email = 'weak@example.com';
    await s.signUpVerified(email, 'Password1');
    await s.post('/auth/forgot-password', { email });
    const code = await s.resetCode(email);
    assert.equal((await s.post('/auth/reset-password', { email, code, password: 'short' })).status, 400);
    assert.equal((await s.post('/auth/reset-password', { email, code, password: 'Strong1234' })).status, 200);
  });

  it('a verification code cannot be used as a reset code', async () => {
    const email = 'cross@example.com';
    await s.post('/auth/signup', { fullName: 'Cross User', email, password: 'Password1' });
    const verifyCode = await s.verificationCode(email);
    await s.post('/auth/forgot-password', { email });
    await s.resetCode(email); // wait until the reset code exists
    const res = await s.post('/auth/reset-password', { email, code: verifyCode, password: 'Another123' });
    assert.equal(res.status, 400);
  });

  it('lets someone who never finished sign-up recover, and verifies them', async () => {
    const email = 'never-verified@example.com';
    await s.post('/auth/signup', { fullName: 'Typo', email, password: 'Mistyped1' });
    await s.post('/auth/forgot-password', { email });
    const res = await s.post('/auth/reset-password', { email, code: await s.resetCode(email), password: 'Correct123' });
    assert.equal(res.status, 200);
    assert.equal((await s.post('/auth/login', { email, password: 'Correct123' })).status, 200);
  });
});
