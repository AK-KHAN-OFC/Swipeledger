'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const Session = require('../models/Session');
const mongoose = require('mongoose');

/**
 * Authenticate a request using the JWT access token.
 *
 * Flow (one DB call):
 *  1. Extract Bearer token from Authorization header
 *  2. Verify JWT signature and expiry → decoded { sub, did, sid, pca }
 *  3. Load session from DB: { _id: sid, accountId: sub, deviceId: did }
 *  4. Check session.isRevoked
 *  5. Check session.expiresAt
 *  6. Compare JWT pca against session.accountPasswordChangedAt
 *  7. Set req.accountId, req.deviceId, req.sessionId
 *
 * The account document is NOT loaded on every request.
 * pca in the JWT payload carries the passwordChangedAt timestamp,
 * and session.accountPasswordChangedAt carries the value stored at session creation.
 */
module.exports = async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_INVALID', message: 'Authentication token required.', requestId: req.id },
    });
  }

  const token = authHeader.slice(7);
  let decoded;

  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    const message =
      code === 'TOKEN_EXPIRED'
        ? 'Access token has expired. Please refresh.'
        : 'Invalid authentication token.';
    return res.status(401).json({
      success: false,
      error: { code, message, requestId: req.id },
    });
  }

  const { sub, did, sid, pca } = decoded;

  // Validate payload shape
  if (!sub || !did || !sid || pca === undefined) {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_INVALID', message: 'Malformed token payload.', requestId: req.id },
    });
  }

  // Single DB call — load session with refreshTokenHash excluded
  let session;
  try {
    session = await Session.findOne({
      _id: new mongoose.Types.ObjectId(sid),
      accountId: new mongoose.Types.ObjectId(sub),
      deviceId: new mongoose.Types.ObjectId(did),
    });
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'TOKEN_INVALID', message: 'Invalid token references.', requestId: req.id },
    });
  }

  if (!session) {
    return res.status(401).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Session not found.', requestId: req.id },
    });
  }

  if (session.isRevoked) {
    return res.status(401).json({
      success: false,
      error: { code: 'SESSION_REVOKED', message: 'Session has been revoked.', requestId: req.id },
    });
  }

  if (session.expiresAt < new Date()) {
    return res.status(401).json({
      success: false,
      error: { code: 'SESSION_EXPIRED', message: 'Session has expired.', requestId: req.id },
    });
  }

  // pca check — compare JWT payload value against session-stored value.
  // If the account's password changed after this session was created,
  // the session is revoked explicitly during password change; this check is
  // a defence-in-depth safety net.
  const sessionPca = session.accountPasswordChangedAt
    ? session.accountPasswordChangedAt.getTime()
    : 0;

  if (Number(pca) !== sessionPca) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'PASSWORD_CHANGED',
        message: 'Account password has changed. Please log in again.',
        requestId: req.id,
      },
    });
  }

  // Attach to request for downstream use
  req.accountId = new mongoose.Types.ObjectId(sub);
  req.deviceId = new mongoose.Types.ObjectId(did);
  req.sessionId = new mongoose.Types.ObjectId(sid);

  next();
};
