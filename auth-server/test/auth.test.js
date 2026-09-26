import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './harness.js';

let s;
before(async () => { s = await startServer(); });
after(() => s?.stop());

describe('sign-up and sessions', () => {
  it('signs up, verifies by code, and returns a working session', async () => {
    const token = await s.signUpVerified('+919876500001', 'Password1');
    assert.equal(await s.me(token), 200);
  });

  it('logout revokes the token', async () => {
    const token = await s.signUpVerified('+919876500002', 'Password1');
    assert.equal((await s.post('/auth/logout', {}, token)).status, 200);
    assert.equal(await s.me(token), 401);
  });

  it('does not let a stranger overwrite a pending sign-up', async () => {
    const phone = '+919876500003';
    await s.post('/auth/signup', { fullName: 'Owner', phone, password: 'Owner1234' });
    const code = await s.verificationCode(phone);
    await s.post('/auth/signup', { fullName: 'Evil', phone, password: 'Attack1234' });
    assert.equal((await s.post('/auth/login', { phone, password: 'Attack1234' })).status, 401);
    assert.equal((await s.post('/auth/verify-phone', { phone, code })).status, 200);
    assert.equal((await s.post('/auth/login', { phone, password: 'Owner1234' })).status, 200);
  });
});

describe('password reset', () => {
  it('gives the same answer for unknown and known numbers', async () => {
    await s.signUpVerified('+919876500004', 'Password1');
    const known = await s.post('/auth/forgot-password', { phone: '+919876500004' });
    const unknown = await s.post('/auth/forgot-password', { phone: '+919876500005' });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
  });

  it('resets the password, signs out old sessions, and the new password works', async () => {
    const phone = '+919876500006';
    const oldToken = await s.signUpVerified(phone, 'OldPassword1');
    await s.post('/auth/forgot-password', { phone });
    const res = await s.post('/auth/reset-password', { phone, code: await s.resetCode(phone), password: 'NewPassword2' });
    assert.equal(res.status, 200);

    assert.equal(await s.me(oldToken), 401, 'old sessions are revoked');
    assert.equal((await s.post('/auth/login', { phone, password: 'OldPassword1' })).status, 401);
    assert.equal((await s.post('/auth/login', { phone, password: 'NewPassword2' })).status, 200);
  });

  it('a reset code cannot be used twice', async () => {
    const phone = '+919876500007';
    await s.signUpVerified(phone, 'Password1');
    await s.post('/auth/forgot-password', { phone });
    const code = await s.resetCode(phone);
    assert.equal((await s.post('/auth/reset-password', { phone, code, password: 'Another123' })).status, 200);
    assert.equal((await s.post('/auth/reset-password', { phone, code, password: 'Third12345' })).status, 400);
  });

  it('rejects wrong codes and locks the code after 5 attempts', async () => {
    const phone = '+919876500008';
    await s.signUpVerified(phone, 'Password1');
    await s.post('/auth/forgot-password', { phone });
    const real = await s.resetCode(phone);
    const wrong = real === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i += 1) {
      assert.equal((await s.post('/auth/reset-password', { phone, code: wrong, password: 'Whatever123' })).status, 400);
    }
    // Even the correct code is refused now; a new one must be requested.
    assert.equal((await s.post('/auth/reset-password', { phone, code: real, password: 'Whatever123' })).status, 429);
  });

  it('enforces the password rules and does not burn an attempt on them', async () => {
    const phone = '+919876500009';
    await s.signUpVerified(phone, 'Password1');
    await s.post('/auth/forgot-password', { phone });
    const code = await s.resetCode(phone);
    assert.equal((await s.post('/auth/reset-password', { phone, code, password: 'short' })).status, 400);
    assert.equal((await s.post('/auth/reset-password', { phone, code, password: 'Strong1234' })).status, 200);
  });

  it('a verification code cannot be used as a reset code', async () => {
    const phone = '+919876500010';
    await s.post('/auth/signup', { fullName: 'Cross User', phone, password: 'Password1' });
    const verifyCode = await s.verificationCode(phone);
    await s.post('/auth/forgot-password', { phone });
    await s.resetCode(phone); // wait until the reset code exists
    const res = await s.post('/auth/reset-password', { phone, code: verifyCode, password: 'Another123' });
    assert.equal(res.status, 400);
  });

  it('lets someone who never finished sign-up recover, and verifies them', async () => {
    const phone = '+919876500011';
    await s.post('/auth/signup', { fullName: 'Typo', phone, password: 'Mistyped1' });
    await s.post('/auth/forgot-password', { phone });
    const res = await s.post('/auth/reset-password', { phone, code: await s.resetCode(phone), password: 'Correct123' });
    assert.equal(res.status, 200);
    assert.equal((await s.post('/auth/login', { phone, password: 'Correct123' })).status, 200);
  });
});
