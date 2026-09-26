// These rules mirror the server's checks. The server is the source of truth;
// these exist to give instant feedback before a request is made.

// Mobile numbers are sent in E.164 form (+<country code><number>). A bare 10-digit number is taken as Indian (+91).
export const PHONE_RE = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(value) {
  const s = String(value ?? '').replace(/[\s\-().]/g, '');
  if (/^\d{10}$/.test(s)) return `+91${s}`;
  if (/^0\d{10}$/.test(s)) return `+91${s.slice(1)}`;
  if (/^91\d{10}$/.test(s)) return `+${s}`;
  if (s.startsWith('00')) return `+${s.slice(2)}`;
  return s;
}

export function validateName(name) {
  if (!name.trim()) return 'Full name is required.';
  if (name.trim().length < 2) return 'Enter your full name.';
  return '';
}

export function validatePhone(phone) {
  if (!phone.trim()) return 'Mobile number is required.';
  if (!PHONE_RE.test(normalizePhone(phone))) return 'Enter a valid mobile number.';
  return '';
}

export const passwordRules = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'number', label: 'One number', test: (p) => /\d/.test(p) },
];

export function validatePassword(password) {
  if (!password) return 'Password is required.';
  if (password.length > 72) return 'Password is too long (72 characters max).';
  const failed = passwordRules.find((rule) => !rule.test(password));
  return failed ? `Password needs: ${failed.label.toLowerCase()}.` : '';
}
