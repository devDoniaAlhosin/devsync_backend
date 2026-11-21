const fs = require('fs');
const admin = require('firebase-admin');

let app;

function loadCredentials() {
  const value = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  return JSON.parse(fs.readFileSync(trimmed, 'utf8'));
}

function getAdmin() {
  if (app) return admin;
  const creds = loadCredentials();
  if (!creds) return null;
  app = admin.initializeApp({ credential: admin.credential.cert(creds) });
  return admin;
}

async function updatePassword(email, newPassword) {
  const sdk = getAdmin();
  if (!sdk) {
    throw Object.assign(new Error('Firebase Admin is not configured'), {
      code: 'admin-missing',
    });
  }
  const user = await sdk.auth().getUserByEmail(email);
  await sdk.auth().updateUser(user.uid, { password: newPassword });
}

async function markEmailVerified(email) {
  const sdk = getAdmin();
  if (!sdk) {
    throw Object.assign(new Error('Firebase Admin is not configured'), {
      code: 'admin-missing',
    });
  }
  const user = await sdk.auth().getUserByEmail(email);
  await sdk.auth().updateUser(user.uid, { emailVerified: true });
}

/** Find or create the Auth user, then return a custom token for Flutter sign-in. */
async function createSignInToken(email) {
  const sdk = getAdmin();
  if (!sdk) {
    throw Object.assign(new Error('Firebase Admin is not configured'), {
      code: 'admin-missing',
    });
  }

  let user;
  try {
    user = await sdk.auth().getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await sdk.auth().createUser({
      email,
      emailVerified: true,
    });
  }

  if (!user.emailVerified) {
    await sdk.auth().updateUser(user.uid, { emailVerified: true });
  }

  const customToken = await sdk.auth().createCustomToken(user.uid, {
    signInProvider: 'otp',
  });
  return customToken;
}

/**
 * Verify a Firebase ID token from `Authorization: Bearer …`.
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>}
 */
async function verifyIdToken(authorizationHeader) {
  const sdk = getAdmin();
  if (!sdk) {
    throw Object.assign(new Error('Firebase Admin is not configured'), {
      code: 'admin-missing',
    });
  }
  const raw = String(authorizationHeader || '');
  const match = raw.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw Object.assign(new Error('Missing Bearer token'), { code: 'unauthenticated' });
  }
  return sdk.auth().verifyIdToken(match[1].trim());
}

/**
 * Write inbox doc + send FCM to all tokens under users/{uid}/fcmTokens.
 */
async function notifyUser({
  targetUid,
  title,
  body,
  type,
  requestId,
  projectId,
  data = {},
}) {
  const sdk = getAdmin();
  if (!sdk) {
    throw Object.assign(new Error('Firebase Admin is not configured'), {
      code: 'admin-missing',
    });
  }

  const db = sdk.firestore();
  const userRef = db.collection('users').doc(targetUid);
  const inboxRef = userRef.collection('notifications').doc();

  await inboxRef.set({
    type,
    title,
    body,
    requestId: requestId || '',
    projectId: projectId || '',
    read: false,
    createdAt: sdk.firestore.FieldValue.serverTimestamp(),
  });

  // Respect Settings → Notifications toggles (default on).
  let pushAllowed = true;
  try {
    const userSnap = await userRef.get();
    const prefs = (userSnap.data() || {}).notificationPrefs || {};
    const eventType = String(type || '');
    const isRequest =
      eventType === 'request_received' ||
      eventType === 'request_accepted' ||
      eventType === 'project_updated';
    const isMatch =
      eventType === 'new_match' || eventType.startsWith('match_');
    if (isRequest && prefs.requests === false) pushAllowed = false;
    if (isMatch && prefs.matches === false) pushAllowed = false;
  } catch (error) {
    console.error('[devsync-backend] notify prefs read failed', error.message);
  }

  if (!pushAllowed) {
    return { inboxId: inboxRef.id, sent: 0, skipped: 'prefs' };
  }

  const tokensSnap = await userRef.collection('fcmTokens').get();

  const tokens = tokensSnap.docs
    .map((doc) => doc.id)
    .filter((t) => typeof t === 'string' && t.length > 0);

  if (tokens.length === 0) {
    return { inboxId: inboxRef.id, sent: 0 };
  }

  const payloadData = {
    title: String(title),
    body: String(body),
    type: String(type),
    requestId: String(requestId || ''),
    projectId: String(projectId || ''),
    ...Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? '')]),
    ),
  };

  const response = await sdk.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: payloadData,
  });

  return {
    inboxId: inboxRef.id,
    sent: response.successCount,
    failureCount: response.failureCount,
  };
}

module.exports = {
  getAdmin,
  updatePassword,
  markEmailVerified,
  createSignInToken,
  verifyIdToken,
  notifyUser,
};
