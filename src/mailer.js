const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const emailLogoPath = path.join(
  __dirname,
  '..',
  'public',
  'brand',
  'png',
  'devsync-logo-light.png',
);

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

function copyFor(purpose) {
  if (purpose === 'reset') {
    return {
      subject: 'Your DevSync password reset code',
      title: 'Reset your password',
      lead: 'Use this code to choose a new DevSync password. It expires in 10 minutes.',
    };
  }
  if (purpose === 'signin') {
    return {
      subject: 'Your DevSync sign-in code',
      title: 'Sign in to DevSync',
      lead: 'Use this code to finish signing in. It expires in 10 minutes.',
    };
  }
  return {
    subject: 'Your DevSync verification code',
    title: 'Verify your email',
    lead: 'Use this code to confirm your DevSync account. It expires in 10 minutes.',
  };
}

function renderHtml({ title, lead, code, withLogo }) {
  const logo = withLogo
    ? '<img src="cid:devsync-logo" alt="DevSync" width="168" style="display:block;border:0;height:36px;width:auto;" />'
    : '<p style="margin:0;font-family:Segoe UI,sans-serif;font-size:20px;font-weight:700;color:#0E2624;">DevSync</p>';

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#F7F5F0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;border:1px solid #E2DDD3;">
          <tr>
            <td style="padding:28px 28px 8px;">${logo}</td>
          </tr>
          <tr>
            <td style="padding:12px 28px 0;font-family:Segoe UI,sans-serif;color:#0E2624;">
              <h1 style="margin:0;font-size:22px;line-height:1.25;font-weight:700;">${title}</h1>
              <p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#5C6B66;">${lead}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 8px;">
              <div style="letter-spacing:0.28em;font-family:Consolas,ui-monospace,monospace;font-size:28px;font-weight:700;color:#0E2624;background:#F7F5F0;border-radius:14px;padding:16px 18px;text-align:center;">${code}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px;font-family:Segoe UI,sans-serif;font-size:13px;line-height:1.5;color:#5C6B66;">
              If you did not request this, you can ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendOtpEmail(to, code, purpose) {
  const copy = copyFor(purpose);
  const text = `Your DevSync code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;
  const withLogo = fs.existsSync(emailLogoPath);

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
    subject: copy.subject,
    text,
    html: renderHtml({ ...copy, code, withLogo }),
    attachments: withLogo
      ? [
          {
            filename: 'devsync-logo-light.png',
            path: emailLogoPath,
            cid: 'devsync-logo',
          },
        ]
      : [],
  });
}

module.exports = { sendOtpEmail, hasSmtp };
