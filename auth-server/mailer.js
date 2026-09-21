import nodemailer from 'nodemailer';

let transporter;

export const isMailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

// Created lazily so dotenv has already loaded by the time we read process.env.
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        // Google shows app passwords with spaces; they work either way.
        pass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
      },
    });
  }
  return transporter;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Confirms the Gmail credentials work (logs in to Google's SMTP server without sending anything). */
export async function verifyMailer() {
  if (!isMailConfigured()) throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD are not set.');
  await getTransporter().verify();
}

/** Sends a plain test message to the sending account itself. */
export async function sendTestEmail() {
  await getTransporter().sendMail({
    from: `"Retina Rescue" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject: 'Retina Rescue email test',
    text: 'Email is configured correctly. Verification and password-reset codes will be delivered like this.',
  });
}

async function sendCodeEmail({ to, name, code, subject, heading, intro, ignoreNote, devLabel }) {
  if (!isMailConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Gmail credentials are not configured.');
    }
    // Development fallback so you can test the flows before setting up Gmail.
    console.log(`\n[DEV] Gmail not configured. ${devLabel} for ${to}: ${code}\n`);
    return;
  }

  await getTransporter().sendMail({
    from: `"Retina Rescue" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text:
      `Hi ${name},\n\n${intro}\n\nYour code: ${code}\n\n` +
      `It expires in 10 minutes. ${ignoreNote}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0d1424">
        <h2 style="margin:0 0 8px">${escapeHtml(heading)}</h2>
        <p style="margin:0 0 20px;color:#475569">Hi ${escapeHtml(name)}, ${escapeHtml(intro)}</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:10px;background:#f1f5f9;border-radius:12px;padding:16px;text-align:center">${escapeHtml(code)}</div>
        <p style="margin:20px 0 0;font-size:12px;color:#64748b">This code expires in 10 minutes. ${escapeHtml(ignoreNote)}</p>
      </div>`,
  });
}

export const sendVerificationEmail = (to, name, code) =>
  sendCodeEmail({
    to,
    name,
    code,
    subject: `${code} is your Retina Rescue verification code`,
    heading: 'Verify your email',
    intro: 'enter this code to finish setting up your Retina Rescue account.',
    ignoreNote: "If you didn't create an account, you can ignore this email.",
    devLabel: 'Verification code',
  });

export const sendPasswordResetEmail = (to, name, code) =>
  sendCodeEmail({
    to,
    name,
    code,
    subject: `${code} is your Retina Rescue password reset code`,
    heading: 'Reset your password',
    intro: 'enter this code to choose a new password for your Retina Rescue account.',
    ignoreNote: "If you didn't ask to reset your password, you can ignore this email; your password has not changed.",
    devLabel: 'Password reset code',
  });
