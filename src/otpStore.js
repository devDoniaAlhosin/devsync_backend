const crypto = require('crypto');

const TTL_MS = Number(process.env.OTP_TTL_MS || 600_000);
const RESEND_MS = Number(process.env.OTP_RESEND_MS || 30_000);
const PEPPER = process.env.OTP_PEPPER || 'devsync-dev-pepper';

/** @type {Map<string, { hash: string, expiresAt: number, sentAt: number, purpose: string }>} */
const codes = new Map();

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function hashCode(email, code) {
  return crypto
    .createHash('sha256')
    .update(`${PEPPER}:${normalizeEmail(email)}:${code}`)
    .digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function canSend(email) {
  const row = codes.get(normalizeEmail(email));
  if (!row) return { ok: true };
  const wait = RESEND_MS - (Date.now() - row.sentAt);
  if (wait > 0) return { ok: false, retryAfterMs: wait };
  return { ok: true };
}

function put(email, code, purpose) {
  const key = normalizeEmail(email);
  codes.set(key, {
    hash: hashCode(key, code),
    expiresAt: Date.now() + TTL_MS,
    sentAt: Date.now(),
    purpose,
  });
}

function consume(email, code, purpose) {
  const key = normalizeEmail(email);
  const row = codes.get(key);
  if (!row || row.purpose !== purpose) return false;
  if (Date.now() > row.expiresAt) {
    codes.delete(key);
    return false;
  }
  const match = crypto.timingSafeEqual(
    Buffer.from(row.hash),
    Buffer.from(hashCode(key, code)),
  );
  if (!match) return false;
  codes.delete(key);
  return true;
}

function peek(email, code, purpose) {
  const key = normalizeEmail(email);
  const row = codes.get(key);
  if (!row || row.purpose !== purpose) return false;
  if (Date.now() > row.expiresAt) {
    codes.delete(key);
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(row.hash),
    Buffer.from(hashCode(key, code)),
  );
}

module.exports = {
  normalizeEmail,
  generateCode,
  canSend,
  put,
  consume,
  peek,
};
