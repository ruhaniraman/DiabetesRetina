// Patient profile + exam history.
//
//   /api/patient/*   used by the signed-in user (session token)
//   /api/internal/*  used only by the ML backend (shared service key), so exam results come from the
//                    model itself and cannot be written by a browser.
//
// Everything sensitive is stored encrypted (vault.js); only ids and timestamps are plain columns.
import crypto from 'node:crypto';
import express from 'express';
import db from './db.js';

export const GENDERS = ['Female', 'Male', 'Other', 'Prefer not to say'];
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
export const GRADES = ['No_DR', 'Mild', 'Moderate', 'Severe', 'Proliferate_DR'];
const NUMERIC_RANGES = {
  diabetesDuration: [0, 90],
  systolicBP: [60, 260],
  diastolicBP: [30, 160],
  hba1c: [3, 20],
  fastingSugar: [30, 700],
};
const MAX_EXAMS = 200;
const MAX_REPORT_BYTES = 20 * 1024 * 1024;

/** Removes the stored reports of a user's exams (call before deleting the exams themselves). */
export const deleteReportsOfUser = (userId) =>
  db.prepare('DELETE FROM exam_reports WHERE exam_id IN (SELECT id FROM exams WHERE user_id = ?)').run(userId);

/* ------------------------------ Validation ------------------------------ */

export function validateProfile(input) {
  const src = input && typeof input === 'object' ? input : {};
  const value = {};
  const errors = {};

  const fullName = String(src.fullName ?? '').trim();
  if (fullName.length < 2 || fullName.length > 100) errors.fullName = 'Enter your full name.';
  else value.fullName = fullName;

  const dob = String(src.dob ?? '');
  const parsed = new Date(`${dob}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dob) {
    errors.dob = 'Enter a valid date of birth.';
  } else if (parsed > new Date() || parsed < new Date('1900-01-01T00:00:00Z')) {
    errors.dob = 'Date of birth is out of range.';
  } else value.dob = dob;

  if (!GENDERS.includes(src.gender)) errors.gender = 'Choose a gender option.';
  else value.gender = src.gender;

  if (!BLOOD_GROUPS.includes(src.bloodGroup)) errors.bloodGroup = 'Choose a blood group.';
  else value.bloodGroup = src.bloodGroup;

  for (const [field, [min, max]] of Object.entries(NUMERIC_RANGES)) {
    const raw = src[field];
    const n = typeof raw === 'string' ? Number(raw.trim() === '' ? NaN : raw) : raw;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) errors[field] = `Enter a value between ${min} and ${max}.`;
    else value[field] = String(n);
  }

  return { value, errors, ok: Object.keys(errors).length === 0 };
}

export function validateExam(input) {
  const src = input && typeof input === 'object' ? input : {};
  const label = (v) => typeof v === 'string' && v.length > 0 && v.length <= 60;
  const conf = (v) => typeof v === 'number' && v >= 0 && v <= 1;
  if (
    !GRADES.includes(src.overallRisk) ||
    !label(src.leftGrade) ||
    !label(src.rightGrade) ||
    !conf(src.leftConfidence) ||
    !conf(src.rightConfidence) ||
    typeof src.summary !== 'string' ||
    src.summary.length > 2000
  ) {
    return null;
  }
  return {
    overallRisk: src.overallRisk,
    leftGrade: src.leftGrade,
    rightGrade: src.rightGrade,
    leftConfidence: src.leftConfidence,
    rightConfidence: src.rightConfidence,
    summary: src.summary,
  };
}

/* ------------------------- Signed-in user's own data ------------------------- */

export function createPatientRouter({ vault }) {
  const router = express.Router();

  router.get('/profile', (req, res) => {
    const row = db.prepare('SELECT data, updated_at FROM patient_profiles WHERE user_id = ?').get(req.user.id);
    if (!row) return res.json({ profile: null });
    try {
      res.json({ profile: vault.decryptJson(row.data), updatedAt: row.updated_at });
    } catch (err) {
      console.error(`Stored profile for user ${req.user.id} could not be decrypted:`, err.message);
      res.status(500).json({ message: 'Your saved profile could not be read.' });
    }
  });

  router.put('/profile', (req, res) => {
    const { value, errors, ok } = validateProfile(req.body);
    if (!ok) return res.status(400).json({ message: 'Please fix the highlighted fields.', errors });
    const now = Date.now();
    db.prepare(
      `INSERT INTO patient_profiles (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(req.user.id, vault.encryptJson(value), now);
    res.json({ profile: value, updatedAt: now });
  });

  router.get('/exams', (req, res) => {
    const rows = db
      .prepare(
        `SELECT e.id, e.data, e.created_at, r.exam_id IS NOT NULL AS has_report
           FROM exams e LEFT JOIN exam_reports r ON r.exam_id = e.id
          WHERE e.user_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT ?`
      )
      .all(req.user.id, MAX_EXAMS);
    const exams = [];
    for (const row of rows) {
      try {
        exams.push({ id: row.id, createdAt: row.created_at, hasReport: Boolean(row.has_report), ...vault.decryptJson(row.data) });
      } catch (err) {
        console.error(`Exam ${row.id} could not be decrypted:`, err.message); // skip one bad row, not the whole list
      }
    }
    res.json({ exams });
  });

  router.delete('/exams/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid exam id.' });
    db.prepare('DELETE FROM exam_reports WHERE exam_id = (SELECT id FROM exams WHERE id = ? AND user_id = ?)').run(id, req.user.id);
    const { changes } = db.prepare('DELETE FROM exams WHERE id = ? AND user_id = ?').run(id, req.user.id);
    if (!changes) return res.status(404).json({ message: 'Exam not found.' });
    res.json({ message: 'Exam deleted.' });
  });

  // The detailed PDF saved with an exam. Only the exam's owner can fetch it.
  router.get('/exams/:id/report', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: 'Invalid exam id.' });
    const row = db
      .prepare('SELECT r.data, e.created_at FROM exam_reports r JOIN exams e ON e.id = r.exam_id WHERE e.id = ? AND e.user_id = ?')
      .get(id, req.user.id);
    if (!row) return res.status(404).json({ message: 'No report is stored for this exam.' });
    let pdf;
    try {
      pdf = vault.decryptBytes(row.data);
    } catch (err) {
      console.error(`Report of exam ${id} could not be decrypted:`, err.message);
      return res.status(500).json({ message: 'The stored report could not be read.' });
    }
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="retina-rescue-report-${day}.pdf"` });
    res.send(pdf);
  });

  // Erase everything health-related for this user (the account itself is kept).
  router.delete('/data', (req, res) => {
    deleteReportsOfUser(req.user.id);
    const exams = db.prepare('DELETE FROM exams WHERE user_id = ?').run(req.user.id).changes;
    const profile = db.prepare('DELETE FROM patient_profiles WHERE user_id = ?').run(req.user.id).changes;
    res.json({ message: 'Your health data was deleted.', deleted: { exams, profile } });
  });

  return router;
}

/* --------------------------- ML backend (service key) --------------------------- */

export function createInternalRouter({ vault, serviceKey }) {
  const router = express.Router();

  const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

  // Service-to-service only. The ML backend calls this directly on the local network; a request that came through
  // the public reverse proxy carries forwarding headers, so it is refused regardless of the key (defence in depth).
  router.use((req, res, next) => {
    if (req.get('x-forwarded-for') || req.get('forwarded') || req.get('x-real-ip')) {
      return res.status(403).json({ message: 'Not available through the public proxy.' });
    }
    next();
  });

  const requireServiceKey = (req, res, next) => {
    if (!serviceKey) return res.status(503).json({ message: 'Exam recording is not configured (SERVICE_KEY).' });
    const supplied = req.get('x-service-key') || '';
    if (!crypto.timingSafeEqual(sha(supplied), sha(serviceKey))) {
      return res.status(401).json({ message: 'Invalid service key.' });
    }
    next();
  };

  router.post('/exams', requireServiceKey, (req, res) => {
    const exam = validateExam(req.body?.exam);
    const userId = Number(req.body?.userId);
    if (!exam || !Number.isInteger(userId)) return res.status(400).json({ message: 'Invalid exam.' });
    if (!db.prepare('SELECT 1 FROM users WHERE id = ? AND is_verified = 1').get(userId)) {
      return res.status(404).json({ message: 'Unknown user.' });
    }

    const { lastInsertRowid } = db
      .prepare('INSERT INTO exams (user_id, data, created_at) VALUES (?, ?, ?)')
      .run(userId, vault.encryptJson(exam), Date.now());
    res.status(201).json({ id: Number(lastInsertRowid) });
  });

  // The ML backend stores the detailed PDF of an exam it has just recorded (the body is the PDF itself).
  router.put('/exams/:id/report', requireServiceKey, express.raw({ type: 'application/pdf', limit: MAX_REPORT_BYTES }), (req, res) => {
    const id = Number(req.params.id);
    const pdf = req.body;
    if (!Number.isInteger(id) || !Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return res.status(400).json({ message: 'Invalid report.' });
    }
    if (!db.prepare('SELECT 1 FROM exams WHERE id = ?').get(id)) return res.status(404).json({ message: 'Exam not found.' });
    db.prepare(
      `INSERT INTO exam_reports (exam_id, data, created_at) VALUES (?, ?, ?)
       ON CONFLICT(exam_id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at`
    ).run(id, vault.encryptBytes(pdf), Date.now());
    res.status(204).end();
  });

  return router;
}
