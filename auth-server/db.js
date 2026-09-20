import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Creates server/retina-rescue.db on first run.
const db = new Database(path.join(__dirname, 'retina-rescue.db'));
db.pragma('journal_mode = WAL');

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

export default db;
