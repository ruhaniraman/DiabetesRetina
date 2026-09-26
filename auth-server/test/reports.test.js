import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { SERVICE_KEY, startServer } from './harness.js';

let s;
before(async () => { s = await startServer(); });
after(() => s?.stop());

const exam = { overallRisk: 'Moderate', leftGrade: 'Stage 2 - Moderate', rightGrade: 'Stage 0 - No DR detected', leftConfidence: 0.9, rightConfidence: 0.8, summary: 'Summary.' };
const PDF = Buffer.from('%PDF-1.4\nfake report body with a secret marker PATIENT-XYZ\n%%EOF');

const userIdOf = async (token) => (await s.call('GET', '/auth/me', { token })).body.user.id;
const record = async (userId) => (await s.call('POST', '/internal/exams', { body: { userId, exam }, headers: { 'x-service-key': SERVICE_KEY } })).body.id;
const upload = (examId, body = PDF, key = SERVICE_KEY, extra = {}) =>
  fetch(`${s.api}/internal/exams/${examId}/report`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf', 'x-service-key': key, ...extra }, body });
const download = (examId, token) => fetch(`${s.api}/patient/exams/${examId}/report`, { headers: { Authorization: `Bearer ${token}` } });

describe('stored exam reports', () => {
  it('only the ML backend can store a report, and only a real PDF for an existing exam', async () => {
    const token = await s.signUpVerified('+919876500101', 'Password1');
    const id = await record(await userIdOf(token));
    assert.equal((await upload(id, PDF, 'wrong-key')).status, 401);
    assert.equal((await upload(id, Buffer.from('not a pdf'))).status, 400);
    assert.equal((await upload(999999)).status, 404);
    assert.equal((await upload(id, PDF, SERVICE_KEY, { 'x-forwarded-for': '1.2.3.4' })).status, 403);
    assert.equal((await upload(id)).status, 204);
  });

  it('lists which exams have a report and gives the owner the same PDF back', async () => {
    const token = await s.signUpVerified('+919876500102', 'Password1');
    const userId = await userIdOf(token);
    const withReport = await record(userId);
    const without = await record(userId);
    await upload(withReport);

    const { exams } = (await s.call('GET', '/patient/exams', { token })).body;
    assert.equal(exams.find((e) => e.id === withReport).hasReport, true);
    assert.equal(exams.find((e) => e.id === without).hasReport, false);

    const res = await download(withReport, token);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="retina-rescue-report-\d{4}-\d{2}-\d{2}\.pdf"$/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), PDF);
    assert.equal((await download(without, token)).status, 404);
  });

  it('never gives one user another user\'s report', async () => {
    const owner = await s.signUpVerified('+919876500103', 'Password1');
    const other = await s.signUpVerified('+919876500104', 'Password1');
    const id = await record(await userIdOf(owner));
    await upload(id);
    assert.equal((await download(id, other)).status, 404);
    assert.equal((await fetch(`${s.api}/patient/exams/${id}/report`)).status, 401);
  });

  it('keeps the PDF encrypted at rest', async () => {
    const token = await s.signUpVerified('+919876500105', 'Password1');
    const id = await record(await userIdOf(token));
    await upload(id);
    const { data } = new DatabaseSync(s.dbPath).prepare('SELECT data FROM exam_reports WHERE exam_id = ?').get(id);
    assert.ok(!data.includes('PATIENT-XYZ') && !Buffer.from(data.split(':')[1], 'base64').includes('PATIENT-XYZ'));
  });

  it('deletes the report with its exam, with all health data, and with the account', async () => {
    const token = await s.signUpVerified('+919876500106', 'Password1');
    const userId = await userIdOf(token);
    const count = () => new DatabaseSync(s.dbPath).prepare('SELECT COUNT(*) AS n FROM exam_reports r JOIN exams e ON e.id = r.exam_id WHERE e.user_id = ?').get(userId).n;
    const orphans = () => new DatabaseSync(s.dbPath).prepare('SELECT COUNT(*) AS n FROM exam_reports WHERE exam_id NOT IN (SELECT id FROM exams)').get().n;

    const one = await record(userId);
    await upload(one);
    assert.equal((await s.call('DELETE', `/patient/exams/${one}`, { token })).status, 200);
    assert.equal(orphans(), 0);

    await upload(await record(userId));
    await s.call('DELETE', '/patient/data', { token });
    assert.equal(orphans(), 0);

    await upload(await record(userId));
    assert.equal(count(), 1);
    assert.equal((await s.call('DELETE', '/auth/account', { token, body: { password: 'Password1' } })).status, 200);
    assert.equal(orphans(), 0);
  });
});
