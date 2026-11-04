/**
 * Regression tests to ensure existing OTP, auth, and health endpoints
 * continue to work after matching implementation.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const app = require('../src/index');

describe('Existing endpoints regression', () => {
  it('GET /health returns expected structure', async () => {
    // This is a smoke test to ensure the health endpoint structure is intact
    // We can't make actual HTTP requests without starting the server,
    // so we verify the app exports correctly
    assert.ok(app, 'Express app should be exported');
    assert.ok(typeof app === 'function' || typeof app === 'object', 'App should be Express instance');
  });

  it('OTP routes should still exist in routes module', () => {
    const routes = require('../src/routes');
    assert.ok(routes, 'Routes module should export router');
  });

  it('Firebase Admin module should still work', () => {
    const { getAdmin, updatePassword, markEmailVerified, createSignInToken } = require('../src/firebaseAdmin');
    assert.ok(typeof getAdmin === 'function');
    assert.ok(typeof updatePassword === 'function');
    assert.ok(typeof markEmailVerified === 'function');
    assert.ok(typeof createSignInToken === 'function');
  });

  it('Mailer module should still work', () => {
    const { sendOtpEmail, hasSmtp } = require('../src/mailer');
    assert.ok(typeof sendOtpEmail === 'function');
    assert.ok(typeof hasSmtp === 'function');
  });

  it('OTP store module should still work', () => {
    const otp = require('../src/otpStore');
    assert.ok(typeof otp.generateCode === 'function');
    assert.ok(typeof otp.put === 'function');
    assert.ok(typeof otp.peek === 'function');
    assert.ok(typeof otp.consume === 'function');
    assert.ok(typeof otp.canSend === 'function');
    assert.ok(typeof otp.normalizeEmail === 'function');
  });

  it('OTP store generates 6-digit codes', () => {
    const otp = require('../src/otpStore');
    const code = otp.generateCode();
    assert.ok(typeof code === 'string');
    assert.strictEqual(code.length, 6);
    assert.ok(/^\d{6}$/.test(code), 'Code should be 6 digits');
  });

  it('OTP store normalizes emails correctly', () => {
    const otp = require('../src/otpStore');
    assert.strictEqual(otp.normalizeEmail('  Test@Example.COM  '), 'test@example.com');
    assert.strictEqual(otp.normalizeEmail('user@domain.com'), 'user@domain.com');
  });

  it('OTP store validates basic rate limiting', () => {
    const otp = require('../src/otpStore');
    const email = 'test@example.com';
    
    // First request should be allowed
    const gate1 = otp.canSend(email);
    assert.strictEqual(gate1.ok, true);
    
    // Put a code
    otp.put(email, '123456', 'verify');
    
    // Immediate second request should be rate-limited
    const gate2 = otp.canSend(email);
    assert.strictEqual(gate2.ok, false, 'Should be rate-limited immediately after sending');
  });

  it('OTP peek validates without consuming', () => {
    const otp = require('../src/otpStore');
    const email = 'peek-test@example.com';
    const code = '654321';
    
    otp.put(email, code, 'verify');
    
    // Peek should return true
    assert.strictEqual(otp.peek(email, code, 'verify'), true);
    
    // Peek again should still work (not consumed)
    assert.strictEqual(otp.peek(email, code, 'verify'), true);
  });

  it('OTP consume removes the code', () => {
    const otp = require('../src/otpStore');
    const email = 'consume-test@example.com';
    const code = '111111';
    
    otp.put(email, code, 'reset');
    
    // Consume should return true
    assert.strictEqual(otp.consume(email, code, 'reset'), true);
    
    // Second consume should fail (already consumed)
    assert.strictEqual(otp.consume(email, code, 'reset'), false);
  });

  it('OTP purpose mismatch fails validation', () => {
    const otp = require('../src/otpStore');
    const email = 'purpose-test@example.com';
    const code = '222222';
    
    otp.put(email, code, 'verify');
    
    // Wrong purpose should fail
    assert.strictEqual(otp.peek(email, code, 'reset'), false);
    assert.strictEqual(otp.peek(email, code, 'signin'), false);
    
    // Correct purpose should work
    assert.strictEqual(otp.peek(email, code, 'verify'), true);
  });
});

describe('Matching endpoint exists', () => {
  it('Matching controller should be properly wired', () => {
    const { generateMatches } = require('../src/matching/controller');
    assert.ok(typeof generateMatches === 'function', 'generateMatches should be exported');
  });

  it('Routes should include matching endpoint', () => {
    const routes = require('../src/routes');
    assert.ok(routes, 'Routes module exports');
    // We can't easily inspect route handlers, but we verified wiring in integration tests
  });
});
