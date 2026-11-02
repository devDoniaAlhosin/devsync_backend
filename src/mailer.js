const nodemailer = require('nodemailer');
const { buildOtpEmail } = require('./emailTemplates');

function hasSmtp() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendOtpEmail(to, code, purpose) {
  const email = buildOtpEmail(purpose, code);

  if (!hasSmtp()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured');
    }
    console.log(`[devsync-backend] OTP for ${to} (${purpose}): ${code}`);
    console.log(`[devsync-backend] subject: ${email.subject}`);
    return;
  }

  await transporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    attachments: email.withLogo
      ? [
          {
            filename: 'devsync-logo-light.png',
            path: email.logoPath,
            cid: 'devsync-logo',
          },
        ]
      : [],
  });
}

module.exports = { sendOtpEmail, hasSmtp };
