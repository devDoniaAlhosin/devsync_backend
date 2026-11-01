const nodemailer = require('nodemailer');

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
  const subject =
    purpose === 'reset' ? 'Your DevSync password reset code' : 'Your DevSync verification code';
  const text = `Your DevSync code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;

  if (!hasSmtp()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured');
    }
    console.log(`[devsync-backend] OTP for ${to} (${purpose}): ${code}`);
    return;
  }

  await transporter().sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

module.exports = { sendOtpEmail, hasSmtp };
