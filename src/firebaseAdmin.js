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

module.exports = {
  getAdmin,
  updatePassword,
  markEmailVerified,
  createSignInToken,
};
