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
    email                    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash            TEXT    NOT NULL,
    is_verified              INTEGER NOT NULL DEFAULT 0,
    verification_code_hash   TEXT,
    verification_expires_at  INTEGER,
    verification_attempts    INTEGER NOT NULL DEFAULT 0,
    verification_sent_at     INTEGER,
    created_at               INTEGER NOT NULL
  );
`);

// Migration for databases created before logout/revocation existed.
const columns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!columns.includes('token_version')) {
  db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0');
}

export default db;
