// Field-level encryption for health data stored in SQLite (AES-256-GCM).
// A leaked database file is then unreadable without DATA_KEY. Authenticated encryption also means
// any tampering with a stored value is detected on read rather than silently accepted.
import crypto from 'node:crypto';

const VERSION = 'v1';

/** Build a vault from a secret string. Exported separately so tests can create their own. */
export function createVault(secret) {
  const key = crypto.createHash('sha256').update(String(secret)).digest(); // 32 bytes

  const encryptBytes = (plain) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
  };

  const decryptBytes = (payload) => {
    const [version, encoded] = String(payload).split(':');
    if (version !== VERSION || !encoded) throw new Error('Unrecognised stored data format.');
    const raw = Buffer.from(encoded, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  };

  return {
    encryptJson: (value) => encryptBytes(Buffer.from(JSON.stringify(value), 'utf8')),
    decryptJson: (payload) => JSON.parse(decryptBytes(payload).toString('utf8')),
    // Files such as a stored PDF report.
    encryptBytes,
    decryptBytes,
  };
}
