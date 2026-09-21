// Verifies the Gmail settings in .env before you rely on them.
//
//   npm run check-email           logs in to Gmail's SMTP server (sends nothing)
//   npm run check-email -- --send also sends a test message to GMAIL_USER itself
import 'dotenv/config';
import { isMailConfigured, sendTestEmail, verifyMailer } from '../mailer.js';

if (!isMailConfigured()) {
  console.error('GMAIL_USER and/or GMAIL_APP_PASSWORD are empty in .env.');
  console.error('Create an App Password at https://myaccount.google.com/apppasswords (needs 2-Step Verification).');
  process.exit(1);
}

try {
  await verifyMailer();
  console.log(`OK: logged in to Gmail as ${process.env.GMAIL_USER}.`);
  if (process.argv.includes('--send')) {
    await sendTestEmail();
    console.log('OK: test email sent. Check the inbox (and spam) of the same address.');
  }
} catch (err) {
  console.error(`FAILED: ${err.message}`);
  if (/Invalid login|Username and Password not accepted|535/i.test(err.message)) {
    console.error('Use a 16-character App Password, not your normal Google password.');
  }
  process.exit(1);
}
