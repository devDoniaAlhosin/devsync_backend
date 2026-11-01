const fs = require('fs');
const admin = require('firebase-admin');

let app;

function getAdmin() {
  if (app) return admin;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!path) return null;
  const raw = fs.readFileSync(path, 'utf8');
  const creds = JSON.parse(raw);
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

module.exports = { getAdmin, updatePassword, markEmailVerified };
