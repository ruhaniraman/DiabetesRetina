// Uses Node's built-in SQLite (node:sqlite, Node 22.13+), so there is no native module to compile.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Creates auth-server/retina-rescue.db on first run. DB_PATH overrides it (e.g. for tests).
const db = new DatabaseSync(process.env.DB_PATH || path.join(__dirname, 'retina-rescue.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name                TEXT    NOT NULL,
    phone                    TEXT    NOT NULL UNIQUE,
    password_hash            TEXT    NOT NULL,
    is_verified              INTEGER NOT NULL DEFAULT 0,
    verification_code_hash   TEXT,
    verification_expires_at  INTEGER,
    verification_attempts    INTEGER NOT NULL DEFAULT 0,
    verification_sent_at     INTEGER,
    created_at               INTEGER NOT NULL
  );
`);

// Health data. `data` holds encrypted JSON (see vault.js); only ids and timestamps are plain.
db.exec(`
  CREATE TABLE IF NOT EXISTS patient_profiles (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data        TEXT    NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exams (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_exams_user_created ON exams (user_id, created_at DESC);
  -- The detailed PDF report of an exam (it contains the eye photographs and heatmaps), encrypted like the rest.
  CREATE TABLE IF NOT EXISTS exam_reports (
    exam_id     INTEGER PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
    data        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL
  );
`);

// Migrations for databases created before these columns existed (fresh databases get them here too).
const columns = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
// Accounts used to be keyed by email; they are now keyed by mobile number. Old email accounts keep their data but
// cannot sign in until re-created with a number.
if (columns.has('email') && !columns.has('phone')) db.exec('ALTER TABLE users RENAME COLUMN email TO phone');
const addedColumns = [
  ['token_version', 'INTEGER NOT NULL DEFAULT 0'], // bumped on logout / password change to revoke old tokens
  ['reset_code_hash', 'TEXT'],
  ['reset_expires_at', 'INTEGER'],
  ['reset_attempts', 'INTEGER NOT NULL DEFAULT 0'],
  ['reset_sent_at', 'INTEGER'],
];
for (const [name, definition] of addedColumns) {
  if (!columns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
}

export default db;
