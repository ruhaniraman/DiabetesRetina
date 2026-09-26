import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './harness.js';

let s;
before(async () => { s = await startServer({ FIXED_OTP: '246810' }); });
after(() => s?.stop());

describe('FIXED_OTP demo mode', () => {
  it('never tells the client the code', async () => {
    assert.equal((await s.call('GET', '/auth/config')).status, 404);
    const { body } = await s.post('/auth/signup', { fullName: 'Quiet User', phone: '+919876500040', password: 'Password1' });
    assert.ok(!JSON.stringify(body).includes('246810'));
  });

  it('verifies a sign-up with the fixed code and rejects any other', async () => {
    const phone = '+919876500018';
    assert.equal((await s.post('/auth/signup', { fullName: 'Demo User', phone, password: 'Password1' })).status, 201);
    assert.equal((await s.post('/auth/verify-phone', { phone, code: '000000' })).status, 400);
    const { status, body } = await s.post('/auth/verify-phone', { phone, code: '246810' });
    assert.equal(status, 200);
    assert.equal(await s.me(body.token), 200);
  });

  it('resets a password with the fixed code', async () => {
    const phone = '+919876500018';
    assert.equal((await s.post('/auth/forgot-password', { phone })).status, 200);
    assert.equal((await s.post('/auth/reset-password', { phone, code: '246810', password: 'Password2' })).status, 200);
    assert.equal((await s.post('/auth/login', { phone, password: 'Password2' })).status, 200);
  });

  it('accepts a number typed with spaces, a leading 0 or no country code', async () => {
    await s.post('/auth/signup', { fullName: 'Local User', phone: '098765 00041', password: 'Password1' });
    assert.equal((await s.post('/auth/verify-phone', { phone: '9876500041', code: '246810' })).status, 200);
    assert.equal((await s.post('/auth/login', { phone: '+91 98765-00041', password: 'Password1' })).status, 200);
  });

  it('rejects something that is not a phone number', async () => {
    const res = await s.post('/auth/signup', { fullName: 'Bad Number', phone: 'abc@example.com', password: 'Password1' });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.phone);
  });
});
