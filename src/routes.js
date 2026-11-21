const express = require('express');
const otp = require('./otpStore');
const { sendOtpEmail } = require('./mailer');
const {
  updatePassword,
  markEmailVerified,
  createSignInToken,
  getAdmin,
  verifyIdToken,
  notifyUser,
} = require('./firebaseAdmin');
const { acceptedCollaboratorIds } = require('./notifyHelpers');

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

const { generateMatches } = require('./matching/controller');

const { createMatchingAccess } = require('./matching/access');
router.post('/matches/generate', createMatchingAccess(), generateMatches);

/**
 * Authenticated push + inbox write.
 * Body:
 *   { requestId, event: 'request_received' | 'request_accepted' }
 *   { projectId, event: 'project_updated' }
 */
router.post('/notify', async (req, res) => {
  let decoded;
  try {
    decoded = await verifyIdToken(req.headers.authorization);
  } catch (error) {
    if (error.code === 'admin-missing') {
      return res.status(503).json({
        ok: false,
        error: 'Notifications are not configured yet (Firebase Admin)',
      });
    }
    return res.status(401).json({ ok: false, error: 'Sign in required' });
  }

  const event = String(req.body?.event || '').trim();
  const requestId = String(req.body?.requestId || '').trim();
  const projectIdBody = String(req.body?.projectId || '').trim();

  if (
    event !== 'request_received' &&
    event !== 'request_accepted' &&
    event !== 'project_updated'
  ) {
    return res.status(400).json({ ok: false, error: 'Invalid event' });
  }

  const sdk = getAdmin();
  if (!sdk) {
    return res.status(503).json({
      ok: false,
      error: 'Notifications are not configured yet (Firebase Admin)',
    });
  }

  const uid = decoded.uid;

  try {
    if (event === 'project_updated') {
      if (!projectIdBody) {
        return res.status(400).json({ ok: false, error: 'projectId is required' });
      }

      const projectSnap = await sdk
        .firestore()
        .collection('projects')
        .doc(projectIdBody)
        .get();
      if (!projectSnap.exists) {
        return res.status(404).json({ ok: false, error: 'Project not found' });
      }

      const project = projectSnap.data() || {};
      const ownerId = String(project.ownerId || project.ownerUid || '');
      if (!ownerId || uid !== ownerId) {
        return res.status(403).json({ ok: false, error: 'Only the owner can notify' });
      }

      const projectTitle = String(project.title || 'a project');
      const requestsSnap = await sdk
        .firestore()
        .collection('requests')
        .where('projectId', '==', projectIdBody)
        .get();

      const targets = acceptedCollaboratorIds(requestsSnap.docs, uid);

      let sent = 0;
      let failureCount = 0;
      const inboxIds = [];
      for (const targetUid of targets) {
        const result = await notifyUser({
          targetUid,
          title: 'Project updated',
          body: `${projectTitle} was updated by the maintainer`,
          type: event,
          requestId: '',
          projectId: projectIdBody,
        });
        sent += result.sent || 0;
        failureCount += result.failureCount || 0;
        if (result.inboxId) inboxIds.push(result.inboxId);
      }

      return res.json({
        ok: true,
        targets: targets.length,
        sent,
        failureCount,
        inboxIds,
      });
    }

    if (!requestId) {
      return res.status(400).json({ ok: false, error: 'requestId is required' });
    }

    const requestSnap = await sdk
      .firestore()
      .collection('requests')
      .doc(requestId)
      .get();
    if (!requestSnap.exists) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }

    const data = requestSnap.data() || {};
    const senderId = String(data.senderId || '');
    const ownerId = String(data.ownerId || '');
    const projectId = String(data.projectId || '');
    const projectTitle = String(data.title || data.targetName || 'a project');
    const status = String(data.status || '');

    let targetUid;
    let title;
    let body;

    if (event === 'request_received') {
      if (uid !== senderId) {
        return res.status(403).json({ ok: false, error: 'Only the sender can notify' });
      }
      targetUid = ownerId;
      title = 'New collaboration request';
      body = `${data.displayName || 'A developer'} wants to join ${projectTitle}`;
    } else {
      if (uid !== ownerId) {
        return res.status(403).json({ ok: false, error: 'Only the owner can notify' });
      }
      if (status !== 'accepted') {
        return res.status(400).json({
          ok: false,
          error: 'Request must be accepted before notifying',
        });
      }
      targetUid = senderId;
      title = 'Request accepted';
      body = `You were accepted on ${projectTitle}`;
    }

    if (!targetUid) {
      return res.status(400).json({ ok: false, error: 'Missing target user' });
    }

    const result = await notifyUser({
      targetUid,
      title,
      body,
      type: event,
      requestId,
      projectId,
    });
    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[devsync-backend] notify failed', error.message);
    return res.status(502).json({ ok: false, error: 'Could not send notification' });
  }
});

module.exports = router;
