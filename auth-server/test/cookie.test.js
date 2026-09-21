import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './harness.js';

let s;
before(async () => { s = await startServer({ CLIENT_ORIGIN: 'http://localhost:5173' }); });
after(() => s?.stop());

const CSRF = { 'X-Requested-With': 'retina-rescue' };
const PROFILE = JSON.stringify({ fullName: 'Test Patient', dob: '1972-05-12', gender: 'Female', bloodGroup: 'A+', diabetesDuration: '12', systolicBP: '138', diastolicBP: '88', hba1c: '7.8', fastingSugar: '140' });

// Logs in with the browser's flow and returns the raw Cookie header a browser would send back.
async function browserSession(email) {
  await s.signUpVerified(email, 'Password1');
  const res = await fetch(`${s.api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password1' }),
  });
  const setCookie = res.headers.get('set-cookie');
  return { res, setCookie, cookie: setCookie.split(';')[0] };
}
const withCookie = (cookie, method, route, extra = {}) =>
  fetch(`${s.api}${route}`, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...extra.headers }, body: extra.body });

describe('session cookie', () => {
  it('login sets an HttpOnly, SameSite=Lax cookie', async () => {
    const { setCookie } = await browserSession('c1@example.com');
    assert.match(setCookie, /^rr_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//);
  });

  it('the cookie alone authenticates reads', async () => {
    const { cookie } = await browserSession('c2@example.com');
    assert.equal((await withCookie(cookie, 'GET', '/auth/me')).status, 200);
    assert.equal((await withCookie('rr_session=garbage', 'GET', '/auth/me')).status, 401);
  });

  it('a cookie-authenticated change is refused without the request header, and works with it', async () => {
    const { cookie } = await browserSession('c3@example.com');
    const noHeader = await withCookie(cookie, 'PUT', '/patient/profile', { body: PROFILE });
    assert.equal(noHeader.status, 403);
    const withHeader = await withCookie(cookie, 'PUT', '/patient/profile', { body: PROFILE, headers: CSRF });
    assert.equal(withHeader.status, 200);
  });

  it('a Bearer token needs no request header (non-browser clients)', async () => {
    const token = await s.signUpVerified('c4@example.com', 'Password1');
    assert.equal((await s.post('/auth/logout', {}, token)).status, 200);
  });

  it('logout clears the cookie and the old cookie stops working', async () => {
    const { cookie } = await browserSession('c5@example.com');
    const out = await withCookie(cookie, 'POST', '/auth/logout', { headers: CSRF, body: '{}' });
    assert.equal(out.status, 200);
    assert.match(out.headers.get('set-cookie'), /rr_session=;/);
    assert.equal((await withCookie(cookie, 'GET', '/auth/me')).status, 401);
  });

  it('deleting the account also clears the cookie', async () => {
    const { cookie } = await browserSession('c6@example.com');
    const del = await withCookie(cookie, 'DELETE', '/auth/account', { headers: CSRF, body: JSON.stringify({ password: 'Password1' }) });
    assert.equal(del.status, 200);
    assert.match(del.headers.get('set-cookie'), /rr_session=;/);
  });

  it('CORS allows the web app origin with credentials, and no other origin', async () => {
    const ok = await fetch(`${s.api}/auth/me`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
    const other = await fetch(`${s.api}/auth/me`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
    assert.notEqual(other.headers.get('access-control-allow-origin'), 'https://evil.example');
  });
});
