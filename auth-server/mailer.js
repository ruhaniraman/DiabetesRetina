import nodemailer from 'nodemailer';

let transporter;

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

export async function sendVerificationEmail(to, name, code) {
  const configured = process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;

  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Gmail credentials are not configured.');
    }
    // Development fallback so you can test the flow before setting up Gmail.
    console.log(`\n[DEV] Gmail not configured. Verification code for ${to}: ${code}\n`);
    return;
  }

  await getTransporter().sendMail({
    from: `"Retina Rescue" <${process.env.GMAIL_USER}>`,
    to,
    subject: `${code} is your Retina Rescue verification code`,
    text:
      `Hi ${name},\n\n` +
      `Your Retina Rescue verification code is ${code}.\n` +
      `It expires in 10 minutes. If you didn't create an account, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#0d1424">
        <h2 style="margin:0 0 8px">Verify your email</h2>
        <p style="margin:0 0 20px;color:#475569">Hi ${escapeHtml(name)}, enter this code to finish setting up your Retina Rescue account.</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:10px;background:#f1f5f9;border-radius:12px;padding:16px;text-align:center">${code}</div>
        <p style="margin:20px 0 0;font-size:12px;color:#64748b">This code expires in 10 minutes. If you didn't create an account, you can ignore this email.</p>
      </div>`,
  });
}
