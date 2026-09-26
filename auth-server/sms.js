// Delivers one-time codes by SMS. No SMS provider is wired in yet: in development the code is printed to this console,
// and in production sending fails (the caller answers 502). With FIXED_OTP set, index.js never calls this.
export async function sendCodeSms(to, code, label) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('No SMS provider is configured.');
  }
  console.log(`\n[DEV] SMS not configured. ${label} for ${to}: ${code}\n`);
}
