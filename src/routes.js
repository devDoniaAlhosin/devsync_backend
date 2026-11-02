const express = require('express');
const otp = require('./otpStore');
const { sendOtpEmail } = require('./mailer');
const {
  updatePassword,
  markEmailVerified,
  createSignInToken,
} = require('./firebaseAdmin');

const router = express.Router();

function emailFrom(body) {
  const email = otp.normalizeEmail(body?.email);
  if (!email || !email.includes('@')) return null;
  return email;
}

function codeFrom(body) {
  const code = String(body?.code || '').replace(/\D/g, '');
  return code.length === 6 ? code : null;
}

function purposeFrom(body, fallback = 'verify') {
  const purpose = String(body?.purpose || fallback).toLowerCase();
  if (purpose === 'reset' || purpose === 'signin' || purpose === 'verify') {
    return purpose;
  }
  return fallback;
}

async function sendOtp(req, res, purpose) {
  const email = emailFrom(req.body);
  if (!email) {
    return res.status(400).json({ ok: false, error: 'Enter a valid email address' });
  }

  const gate = otp.canSend(email);
  if (!gate.ok) {
    return res.status(429).json({
      ok: false,
      error: 'Wait a moment before requesting another code',
    });
  }

  const code = otp.generateCode();
  otp.put(email, code, purpose);

  try {
    await sendOtpEmail(email, code, purpose);
  } catch (error) {
    console.error('[devsync-backend] mail failed', error.message);
    return res.status(502).json({ ok: false, error: 'Could not send email' });
  }

  return res.json({ ok: true });
}

router.post('/otp/send', (req, res) => {
  return sendOtp(req, res, purposeFrom(req.body, 'verify'));
});

router.post('/otp/verify', (req, res) => {
  const email = emailFrom(req.body);
  const code = codeFrom(req.body);
  const purpose = purposeFrom(req.body, 'verify');
  if (!email || !code) {
    return res.status(400).json({ ok: false, error: 'Enter the 6-digit code' });
  }
  const valid = otp.peek(email, code, purpose);
  if (!valid) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired code' });
  }
  return res.json({ ok: true });
});

router.post('/password/reset', async (req, res) => {
  const email = emailFrom(req.body);
  const code = codeFrom(req.body);
  const newPassword = String(req.body?.newPassword || '');
  if (!email || !code) {
    return res.status(400).json({ ok: false, error: 'Enter the 6-digit code' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ ok: false, error: 'Password is too weak' });
  }
  if (!otp.consume(email, code, 'reset')) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired code' });
  }
  try {
    await updatePassword(email, newPassword);
  } catch (error) {
    if (error.code === 'admin-missing') {
      return res.status(503).json({
        ok: false,
        error: 'Password update is not configured yet',
      });
    }
    if (error.code === 'auth/user-not-found') {
      return res.json({ ok: true });
    }
    console.error('[devsync-backend] reset failed', error.message);
    return res.status(502).json({ ok: false, error: 'Could not update password' });
  }
  return res.json({ ok: true });
});

router.post('/email/verify', async (req, res) => {
  const email = emailFrom(req.body);
  const code = codeFrom(req.body);
  if (!email || !code) {
    return res.status(400).json({ ok: false, error: 'Enter the 6-digit code' });
  }
  if (!otp.consume(email, code, 'verify')) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired code' });
  }
  try {
    await markEmailVerified(email);
  } catch (error) {
    if (error.code === 'admin-missing') {
      return res.status(503).json({
        ok: false,
        error: 'Email verification update is not configured yet',
      });
    }
    if (error.code === 'auth/user-not-found') {
      return res.json({ ok: true });
    }
    console.error('[devsync-backend] email verify failed', error.message);
    return res.status(502).json({ ok: false, error: 'Could not verify email' });
  }
  return res.json({ ok: true });
});

/** Passwordless sign-in: verify OTP then return a Firebase custom token. */
router.post('/auth/session', async (req, res) => {
  const email = emailFrom(req.body);
  const code = codeFrom(req.body);
  if (!email || !code) {
    return res.status(400).json({ ok: false, error: 'Enter the 6-digit code' });
  }
  if (!otp.consume(email, code, 'signin')) {
    return res.status(400).json({ ok: false, error: 'Invalid or expired code' });
  }
  try {
    const customToken = await createSignInToken(email);
    return res.json({ ok: true, customToken });
  } catch (error) {
    if (error.code === 'admin-missing') {
      return res.status(503).json({
        ok: false,
        error: 'Sign-in with code is not configured yet (Firebase Admin)',
      });
    }
    console.error('[devsync-backend] session failed', error.message);
    return res.status(502).json({ ok: false, error: 'Could not start session' });
  }
});

router.post('/matches/generate', (_req, res) => {
  res.status(501).json({
    ok: false,
    error:
      'Gemini matching is not implemented yet. Emad: call Gemini Flash-Lite here and return { score, reason, skills[] }.',
  });
});

module.exports = router;
