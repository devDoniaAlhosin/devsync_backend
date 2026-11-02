const fs = require('fs');
const path = require('path');

const emailLogoPath = path.join(
  __dirname,
  '..',
  'public',
  'brand',
  'png',
  'devsync-logo-light.png',
);

const brand = {
  bg: '#F4FBF9',
  card: '#FFFFFF',
  ink: '#0E2624',
  muted: '#5C6B66',
  line: '#D7E8E3',
  teal: '#14998A',
  tealSoft: '#E6F7F4',
  forest: '#0E2624',
};

function templateFor(purpose, code) {
  if (purpose === 'reset') {
    return {
      subject: 'Reset your DevSync password',
      preheader: 'Your password reset code expires in 10 minutes.',
      eyebrow: 'Password recovery',
      title: 'Reset your password',
      lead: 'We received a request to reset the password for your DevSync account. Enter this code in the app to continue.',
      tipTitle: 'Keep your workspace safe',
      tipBody: 'Never share this code. DevSync staff will never ask for it.',
      codeLabel: 'Reset code',
      code,
    };
  }
  if (purpose === 'signin') {
    return {
      subject: 'Your DevSync sign-in code',
      preheader: 'Use this code to sign in — expires in 10 minutes.',
      eyebrow: 'Passwordless sign-in',
      title: 'Sign in to DevSync',
      lead: 'Use the code below to finish signing in. No password needed on this step.',
      tipTitle: 'One-time access',
      tipBody: 'This code works once and expires in 10 minutes. If you did not try to sign in, you can ignore this email.',
      codeLabel: 'Sign-in code',
      code,
    };
  }
  return {
    subject: 'Verify your DevSync email',
    preheader: 'Confirm your email with this 6-digit code.',
    eyebrow: 'Email verification',
    title: 'Verify your email',
    lead: 'Welcome to DevSync. Enter this code to confirm your email and activate your account.',
    tipTitle: 'Almost there',
    tipBody: 'After verification you can connect GitHub, set skills, and start matching with projects.',
    codeLabel: 'Verification code',
    code,
  };
}

function plainText(tpl) {
  return [
    `${tpl.title}`,
    '',
    tpl.lead,
    '',
    `${tpl.codeLabel}: ${tpl.code}`,
    '',
    tpl.tipBody,
    '',
    'If you did not request this, ignore this email.',
    '',
    '— DevSync',
  ].join('\n');
}

function renderHtml(tpl, withLogo) {
  const logo = withLogo
    ? `<img src="cid:devsync-logo" alt="DevSync" width="150" height="32" style="display:block;border:0;height:32px;width:auto;" />`
    : `<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:22px;font-weight:800;color:${brand.ink};letter-spacing:-0.02em;">DevSync</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${tpl.subject}</title>
</head>
<body style="margin:0;padding:0;background:${brand.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${tpl.preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.bg};padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${brand.card};border:1px solid ${brand.line};border-radius:22px;overflow:hidden;">
          <tr>
            <td style="height:6px;background:linear-gradient(90deg, ${brand.teal}, #2EE0C8);font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">${logo}</td>
          </tr>
          <tr>
            <td style="padding:4px 28px 0;font-family:'Segoe UI',Arial,sans-serif;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${brand.teal};">${tpl.eyebrow}</p>
              <h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;font-weight:800;color:${brand.ink};letter-spacing:-0.03em;">${tpl.title}</h1>
              <p style="margin:12px 0 0;font-size:15px;line-height:1.55;color:${brand.muted};">${tpl.lead}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.tealSoft};border:1px solid ${brand.line};border-radius:16px;">
                <tr>
                  <td style="padding:18px 16px;text-align:center;font-family:'Segoe UI',Arial,sans-serif;">
                    <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${brand.teal};">${tpl.codeLabel}</p>
                    <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:0.34em;color:${brand.ink};">${tpl.code}</p>
                    <p style="margin:12px 0 0;font-size:12px;color:${brand.muted};">Expires in 10 minutes</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px;font-family:'Segoe UI',Arial,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFBFA;border-radius:14px;border:1px solid ${brand.line};">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:13px;font-weight:700;color:${brand.ink};">${tpl.tipTitle}</p>
                    <p style="margin:6px 0 0;font-size:13px;line-height:1.5;color:${brand.muted};">${tpl.tipBody}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:${brand.muted};">If you did not request this, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:${brand.muted};">DevSync · Open-source collaboration</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOtpEmail(purpose, code) {
  const tpl = templateFor(purpose, code);
  const withLogo = fs.existsSync(emailLogoPath);
  return {
    subject: tpl.subject,
    text: plainText(tpl),
    html: renderHtml(tpl, withLogo),
    withLogo,
    logoPath: emailLogoPath,
  };
}

module.exports = { buildOtpEmail, emailLogoPath };
