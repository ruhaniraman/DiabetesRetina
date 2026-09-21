import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productionProblems, trustProxySetting } from '../prodcheck.js';
import { SERVICE_KEY, startServer } from './harness.js';

const good = {
  NODE_ENV: 'production',
  JWT_SECRET: 'a'.repeat(40),
  DATA_KEY: 'b'.repeat(40),
  SERVICE_KEY: 'c'.repeat(40),
  GMAIL_USER: 'sender@gmail.com',
  GMAIL_APP_PASSWORD: 'abcdabcdabcdabcd',
  CLIENT_ORIGIN: 'https://retina.example.org',
};

describe('productionProblems', () => {
  it('accepts a complete, strong configuration', () => {
    assert.deepEqual(productionProblems(good), []);
  });

  it('rejects missing, short and placeholder secrets', () => {
    for (const key of ['JWT_SECRET', 'DATA_KEY', 'SERVICE_KEY']) {
      assert.equal(productionProblems({ ...good, [key]: undefined }).length, 1, `${key} missing`);
      assert.equal(productionProblems({ ...good, [key]: 'short' }).length, 1, `${key} short`);
      assert.equal(productionProblems({ ...good, [key]: 'replace-with-a-long-random-string-xxxxxxxxx' }).length, 1, `${key} placeholder`);
    }
  });

  it('rejects reusing one secret for several purposes', () => {
    assert.ok(productionProblems({ ...good, DATA_KEY: good.JWT_SECRET }).some((p) => /different/.test(p)));
    assert.ok(productionProblems({ ...good, SERVICE_KEY: good.DATA_KEY }).some((p) => /differ/.test(p)));
  });

  it('requires real email settings', () => {
    assert.ok(productionProblems({ ...good, GMAIL_USER: '' }).some((p) => /GMAIL/.test(p)));
    assert.ok(productionProblems({ ...good, GMAIL_APP_PASSWORD: undefined }).some((p) => /GMAIL/.test(p)));
  });

  it('requires a public https origin', () => {
    for (const origin of ['http://retina.example.org', 'https://localhost:5173', 'https://127.0.0.1', 'not a url', undefined]) {
      assert.ok(productionProblems({ ...good, CLIENT_ORIGIN: origin }).some((p) => /CLIENT_ORIGIN/.test(p)), String(origin));
    }
  });

  it('reports every problem at once', () => {
    assert.ok(productionProblems({ NODE_ENV: 'production' }).length >= 5);
  });
});

describe('trustProxySetting', () => {
  it('is off in development and one proxy hop in production by default', () => {
    assert.equal(trustProxySetting({}), false);
    assert.equal(trustProxySetting({ NODE_ENV: 'production' }), 1);
  });
  it('honours an explicit value', () => {
    assert.equal(trustProxySetting({ TRUST_PROXY: '2' }), 2);
    assert.equal(trustProxySetting({ TRUST_PROXY: '0' }), false);
    assert.equal(trustProxySetting({ TRUST_PROXY: 'false', NODE_ENV: 'production' }), false);
    assert.equal(trustProxySetting({ TRUST_PROXY: 'loopback' }), 'loopback');
  });
});

describe('behind a reverse proxy', () => {
  let s;
  before(async () => { s = await startServer({ TRUST_PROXY: '1' }); });
  after(() => s?.stop());

  const forgot = (ip) =>
    s.call('POST', '/auth/forgot-password', { body: { email: 'someone@example.com' }, headers: { 'x-forwarded-for': ip } });

  it('rate-limits each real client separately, not the proxy as a whole', async () => {
    for (let i = 0; i < 10; i += 1) assert.equal((await forgot('203.0.113.1')).status, 200);
    assert.equal((await forgot('203.0.113.1')).status, 429, 'the 11th request from one client is limited');
    assert.equal((await forgot('203.0.113.2')).status, 200, 'a different client is unaffected');
  });

  it('refuses the internal exam endpoint when the request came through the proxy', async () => {
    const res = await s.call('POST', '/internal/exams', {
      body: { userId: 1, exam: {} },
      headers: { 'x-service-key': SERVICE_KEY, 'x-forwarded-for': '198.51.100.7' },
    });
    assert.equal(res.status, 403);
  });

  it('still accepts a direct (non-proxied) call with the key', async () => {
    const res = await s.call('POST', '/internal/exams', { body: { userId: 999999, exam: {} }, headers: { 'x-service-key': SERVICE_KEY } });
    assert.notEqual(res.status, 403);
  });

  it('marks API responses as not cacheable and sends security headers', async () => {
    const res = await fetch(`${s.api}/auth/me`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('strict-transport-security') || '', /max-age=/);
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
