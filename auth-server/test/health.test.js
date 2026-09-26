import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SERVICE_KEY, startServer } from './harness.js';
import { createVault } from '../vault.js';

let s;
before(async () => { s = await startServer(); });
after(() => {
  raw?.close(); // Windows can't delete a database file that is still open
  s?.stop();
});

const profile = {
  fullName: 'Secret Patient Name',
  dob: '1972-05-12',
  gender: 'Female',
  bloodGroup: 'A+',
  diabetesDuration: '12',
  systolicBP: '138',
  diastolicBP: '88',
  hba1c: '7.8',
  fastingSugar: '140',
};
const exam = {
  overallRisk: 'Moderate',
  leftGrade: 'Stage 2 - Moderate',
  rightGrade: 'Stage 0 - Clear',
  leftConfidence: 0.91,
  rightConfidence: 0.8,
  summary: 'Moderate NPDR flagged in the left eye.',
};

const userIdOf = async (token) => (await s.call('GET', '/auth/me', { token })).body.user.id;
const record = (userId, e = exam, key = SERVICE_KEY) =>
  s.call('POST', '/internal/exams', { body: { userId, exam: e }, headers: { 'x-service-key': key } });
let raw;
const rawDb = () => (raw ??= new DatabaseSync(s.dbPath));

describe('patient profile', () => {
  it('requires a session', async () => {
    assert.equal((await s.call('GET', '/patient/profile')).status, 401);
    assert.equal((await s.call('PUT', '/patient/profile', { body: profile })).status, 401);
  });

  it('starts empty, then saves and returns the profile', async () => {
    const token = await s.signUpVerified('+919876500019', 'Password1');
    assert.equal((await s.call('GET', '/patient/profile', { token })).body.profile, null);
    assert.equal((await s.call('PUT', '/patient/profile', { token, body: profile })).status, 200);
    assert.deepEqual((await s.call('GET', '/patient/profile', { token })).body.profile, profile);
  });

  it('updates in place', async () => {
    const token = await s.signUpVerified('+919876500020', 'Password1');
    await s.call('PUT', '/patient/profile', { token, body: profile });
    await s.call('PUT', '/patient/profile', { token, body: { ...profile, hba1c: 6.5 } });
    assert.equal((await s.call('GET', '/patient/profile', { token })).body.profile.hba1c, '6.5');
  });

  it('rejects invalid values with per-field errors', async () => {
    const token = await s.signUpVerified('+919876500021', 'Password1');
    const bad = { ...profile, dob: '2999-01-01', gender: 'Robot', hba1c: 99, systolicBP: 'abc', fullName: 'x' };
    const res = await s.call('PUT', '/patient/profile', { token, body: bad });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.errors).sort(), ['dob', 'fullName', 'gender', 'hba1c', 'systolicBP']);
  });

  it("never shows one user's profile to another", async () => {
    const a = await s.signUpVerified('+919876500022', 'Password1');
    const b = await s.signUpVerified('+919876500023', 'Password1');
    await s.call('PUT', '/patient/profile', { token: a, body: profile });
    assert.equal((await s.call('GET', '/patient/profile', { token: b })).body.profile, null);
  });

  it('is stored encrypted on disk', async () => {
    const token = await s.signUpVerified('+919876500024', 'Password1');
    await s.call('PUT', '/patient/profile', { token, body: profile });
    const row = rawDb().prepare('SELECT data FROM patient_profiles WHERE user_id = ?').get(await userIdOf(token));
    assert.match(row.data, /^v1:/);
    assert.ok(!row.data.includes('Secret'), 'plain text must not appear in the database');
    assert.ok(!Buffer.from(row.data.slice(3), 'base64').toString('latin1').includes('Secret'));
  });
});

describe('exam history', () => {
  it('only the ML backend (correct service key) can record exams', async () => {
    const token = await s.signUpVerified('+919876500025', 'Password1');
    const id = await userIdOf(token);
    assert.equal((await record(id, exam, 'wrong-key')).status, 401);
    assert.equal((await s.call('POST', '/internal/exams', { body: { userId: id, exam } })).status, 401);
    // A signed-in user cannot write their own history either.
    assert.equal((await s.call('POST', '/internal/exams', { token, body: { userId: id, exam } })).status, 401);
    assert.equal((await record(id)).status, 201);
  });

  it('lists a users exams newest first, decrypted', async () => {
    const token = await s.signUpVerified('+919876500026', 'Password1');
    const id = await userIdOf(token);
    await record(id, { ...exam, overallRisk: 'Mild', leftGrade: 'Stage 1 - Mild' });
    await new Promise((r) => setTimeout(r, 5));
    await record(id, exam);
    const { exams } = (await s.call('GET', '/patient/exams', { token })).body;
    assert.equal(exams.length, 2);
    assert.equal(exams[0].overallRisk, 'Moderate');
    assert.equal(exams[1].overallRisk, 'Mild');
    assert.equal(exams[0].summary, exam.summary);
  });

  it('rejects malformed exams and unknown users', async () => {
    const token = await s.signUpVerified('+919876500027', 'Password1');
    const id = await userIdOf(token);
    assert.equal((await record(id, { ...exam, overallRisk: 'Cured' })).status, 400);
    assert.equal((await record(id, { ...exam, leftConfidence: 7 })).status, 400);
    assert.equal((await record(999999)).status, 404);
  });

  it("keeps users' exams separate, including deletes", async () => {
    const a = await s.signUpVerified('+919876500028', 'Password1');
    const b = await s.signUpVerified('+919876500029', 'Password1');
    const { body } = await record(await userIdOf(a));
    assert.equal((await s.call('GET', '/patient/exams', { token: b })).body.exams.length, 0);
    assert.equal((await s.call('DELETE', `/patient/exams/${body.id}`, { token: b })).status, 404);
    assert.equal((await s.call('DELETE', `/patient/exams/${body.id}`, { token: a })).status, 200);
    assert.equal((await s.call('GET', '/patient/exams', { token: a })).body.exams.length, 0);
  });

  it('deletes all health data but keeps the account', async () => {
    const token = await s.signUpVerified('+919876500030', 'Password1');
    const id = await userIdOf(token);
    await s.call('PUT', '/patient/profile', { token, body: profile });
    await record(id);
    await record(id);
    const res = await s.call('DELETE', '/patient/data', { token });
    assert.deepEqual(res.body.deleted, { exams: 2, profile: 1 });
    assert.equal((await s.call('GET', '/patient/profile', { token })).body.profile, null);
    assert.equal((await s.call('GET', '/patient/exams', { token })).body.exams.length, 0);
    assert.equal(await s.me(token), 200, 'the account still works');
  });

  it('skips a tampered row instead of failing the whole list', async () => {
    const token = await s.signUpVerified('+919876500031', 'Password1');
    const id = await userIdOf(token);
    await record(id);
    const { body } = await record(id, { ...exam, overallRisk: 'Severe' });
    const db = rawDb();
    const original = db.prepare('SELECT data FROM exams WHERE id = ?').get(body.id).data;
    const flipped = original.slice(0, -6) + (original.at(-6) === 'A' ? 'B' : 'A') + original.slice(-5);
    db.prepare('UPDATE exams SET data = ? WHERE id = ?').run(flipped, body.id);
    const { exams } = (await s.call('GET', '/patient/exams', { token })).body;
    assert.equal(exams.length, 1);
    assert.equal(exams[0].overallRisk, 'Moderate');
  });
});

describe('vault', () => {
  it('round-trips, uses a fresh IV each time, and rejects a wrong key or tampering', () => {
    const vault = createVault('k1');
    const a = vault.encryptJson({ x: 1 });
    assert.notEqual(a, vault.encryptJson({ x: 1 }));
    assert.deepEqual(vault.decryptJson(a), { x: 1 });
    assert.throws(() => createVault('k2').decryptJson(a));
    const tampered = a.slice(0, -4) + (a.at(-4) === 'A' ? 'B' : 'A') + a.slice(-3);
    assert.throws(() => vault.decryptJson(tampered));
    assert.throws(() => vault.decryptJson('garbage'));
  });
});

describe('account deletion', () => {
  const del = (token, body) => s.call('DELETE', '/auth/account', { token, body });
  const rowsFor = (table, id) => rawDb().prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} = ?`).get(id).n;

  it('needs a signed-in session', async () => {
    assert.equal((await del(undefined, { password: 'Password1' })).status, 401);
  });

  it('refuses without the password or with a wrong one, and deletes nothing', async () => {
    const token = await s.signUpVerified('+919876500032', 'Password1');
    const id = await userIdOf(token);
    assert.equal((await del(token, {})).status, 400);
    assert.equal((await del(token, { password: 'Nope12345' })).status, 403);
    assert.equal(rowsFor('users', id), 1);
    assert.equal(await s.me(token), 200);
  });

  it('erases the account, profile and every exam, and the session stops working', async () => {
    const token = await s.signUpVerified('+919876500033', 'Password1');
    const id = await userIdOf(token);
    await s.call('PUT', '/patient/profile', { token, body: profile });
    await record(id);
    await record(id);
    assert.equal(rowsFor('exams', id), 2);

    assert.equal((await del(token, { password: 'Password1' })).status, 200);
    assert.equal(rowsFor('users', id), 0);
    assert.equal(rowsFor('patient_profiles', id), 0);
    assert.equal(rowsFor('exams', id), 0);
    assert.equal(await s.me(token), 401);
    assert.equal((await s.post('/auth/login', { phone: '+919876500033', password: 'Password1' })).status, 401);
  });

  it('leaves other users untouched, and the number can be registered again', async () => {
    const a = await s.signUpVerified('+919876500034', 'Password1');
    const b = await s.signUpVerified('+919876500035', 'Password1');
    const idB = await userIdOf(b);
    await record(idB);
    await del(a, { password: 'Password1' });
    assert.equal(rowsFor('exams', idB), 1);
    assert.equal(await s.me(b), 200);
    assert.ok(await s.signUpVerified('+919876500034', 'Password2'));
  });
});
