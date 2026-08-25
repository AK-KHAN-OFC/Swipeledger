'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

/**
 * Sign an access token.
 * Payload: { sub (accountId), did (deviceId), sid (sessionId), pca (passwordChangedAt ms) }
 *
 * jti (JWT ID) is a cryptographically random nonce included in every token.
 * It guarantees that two tokens signed with identical sub/did/sid/pca within
 * the same second produce different strings — required because jwt.sign() uses
 * iat (issued-at) in whole seconds, so tokens issued sub-second are otherwise
 * byte-for-byte identical. In tests this happens on every login+refresh pair.
 * In production jti also enables per-token revocation if needed in the future.
 */
function signAccessToken({ sub, did, sid, pca }) {
  return jwt.sign(
    { sub, did, sid, pca, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '60m', algorithm: 'HS256' },
  );
}

/**
 * Verify an access token.
 * Returns decoded payload or throws with name 'TokenExpiredError' | 'JsonWebTokenError'.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = { signAccessToken, verifyAccessToken };
