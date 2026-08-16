'use strict';

const { signAccessToken, verifyAccessToken } = require('../../server/utils/jwt');
const { hashPassword, comparePassword } = require('../../server/utils/password');

// ── JWT ───────────────────────────────────────────────────────────────────────
describe('JWT utilities', () => {
  const payload = {
    sub: '507f1f77bcf86cd799439011',
    did: '507f1f77bcf86cd799439012',
    sid: '507f1f77bcf86cd799439013',
    pca: Date.now(),
  };

  test('signAccessToken produces a verifiable token', () => {
    const token = signAccessToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  test('verifyAccessToken returns correct payload fields', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.did).toBe(payload.did);
    expect(decoded.sid).toBe(payload.sid);
    expect(decoded.pca).toBe(payload.pca);
  });

  test('verifyAccessToken throws TokenExpiredError on expired token', () => {
    // Sign with 0-second expiry
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '0s' });
    // Give it a moment to expire
    return new Promise((resolve) => setTimeout(resolve, 10)).then(() => {
      expect(() => verifyAccessToken(token)).toThrow(
        expect.objectContaining({ name: 'TokenExpiredError' }),
      );
    });
  });

  test('verifyAccessToken throws JsonWebTokenError on tampered token', () => {
    const token = signAccessToken(payload);
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(() => verifyAccessToken(tampered)).toThrow(
      expect.objectContaining({ name: 'JsonWebTokenError' }),
    );
  });

  test('verifyAccessToken throws on wrong secret', () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(payload, 'wrong-secret-at-least-32-characters!!');
    expect(() => verifyAccessToken(token)).toThrow();
  });
});

// ── Password ──────────────────────────────────────────────────────────────────
describe('Password utilities', () => {
  test('hashPassword produces a bcrypt hash', async () => {
    const hash = await hashPassword('mypassword123');
    expect(hash).toMatch(/^\$2b\$/);
  });

  test('comparePassword returns true for correct password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await comparePassword('correct-password', hash)).toBe(true);
  });

  test('comparePassword returns false for wrong password', async () => {
    const hash = await hashPassword('correct-password');
    expect(await comparePassword('wrong-password', hash)).toBe(false);
  });

  test('two hashes of the same password are different (salt randomness)', async () => {
    const h1 = await hashPassword('same-password');
    const h2 = await hashPassword('same-password');
    expect(h1).not.toBe(h2);
    // Both should still verify correctly
    expect(await comparePassword('same-password', h1)).toBe(true);
    expect(await comparePassword('same-password', h2)).toBe(true);
  });

  test('hashPassword never stores plaintext', async () => {
    const plain = 'mySuperSecret123';
    const hash  = await hashPassword(plain);
    expect(hash).not.toContain(plain);
  });
});
