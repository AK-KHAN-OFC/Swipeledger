'use strict';

const jwt = require('jsonwebtoken');

/**
 * Sign an access token.
 * Payload: { sub (accountId), did (deviceId), sid (sessionId), pca (passwordChangedAt ms) }
 */
function signAccessToken({ sub, did, sid, pca }) {
  return jwt.sign({ sub, did, sid, pca }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || '60m',
    algorithm: 'HS256',
  });
}

/**
 * Verify an access token.
 * Returns decoded payload or throws with name 'TokenExpiredError' | 'JsonWebTokenError'.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = { signAccessToken, verifyAccessToken };
