// These rules mirror the server's checks. The server is the source of truth;
// these exist to give instant feedback before a request is made.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateName(name) {
  if (!name.trim()) return 'Full name is required.';
  if (name.trim().length < 2) return 'Enter your full name.';
  return '';
}

export function validateEmail(email) {
  if (!email.trim()) return 'Email is required.';
  if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
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
