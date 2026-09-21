// Shared helpers for the integration tests: start the real server on a throwaway database and call it over HTTP.
// Verification/reset codes are read from the server's dev-console output, so no Gmail is needed.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const SERVICE_KEY = 'test-service-key-0123456789';

export async function startServer(extraEnv = {}) {
  const port = 4300 + Math.floor(Math.random() * 500);
  const api = `http://127.0.0.1:${port}/api`;
  const tmp = mkdtempSync(path.join(tmpdir(), 'rr-auth-'));
  let output = '';

  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'index.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(tmp, 'test.db'),
      JWT_SECRET: 'test-secret-test-secret-test-secret',
      DATA_KEY: 'test-data-key',
      SERVICE_KEY,
      GMAIL_USER: '',
      GMAIL_APP_PASSWORD: '',
      NODE_ENV: 'development',
      ...extraEnv,
    },
  });
  server.stdout.on('data', (d) => { output += d; });
  server.stderr.on('data', (d) => { output += d; });

  for (let i = 0; i < 100 && !output.includes('running on'); i += 1) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!output.includes('running on')) throw new Error(`Server did not start:\n${output}`);

  async function call(method, route, { body, token, headers } = {}) {
    const res = await fetch(`${api}${route}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  const post = (route, body, token) => call('POST', route, { body: body ?? {}, token });
  const me = async (token) => (await call('GET', '/auth/me', { token })).status;

  async function latestCode(label, email) {
    const re = new RegExp(`${label} for ${email.replace(/[.+]/g, '\\$&')}: (\\d{6})`, 'g');
    for (let i = 0; i < 40; i += 1) {
      const found = [...output.matchAll(re)];
      if (found.length) return found.at(-1)[1];
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`No "${label}" line for ${email} in server output`);
  }

  async function signUpVerified(email, password) {
    await post('/auth/signup', { fullName: 'Test User', email, password });
    const { body } = await post('/auth/verify-email', { email, code: await latestCode('Verification code', email) });
    return body.token;
  }

  return {
    api,
    call,
    post,
    me,
    signUpVerified,
    verificationCode: (email) => latestCode('Verification code', email),
    resetCode: (email) => latestCode('Password reset code', email),
    dbPath: path.join(tmp, 'test.db'),
    stop() {
      server.kill();
      setTimeout(() => {
        try {
          rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch {
          /* best effort: a leftover temp dir is harmless */
        }
      }, 300);
    },
  };
}
