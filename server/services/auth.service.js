'use strict';

const crypto = require('crypto');
const Account = require('../models/Account');
const Session = require('../models/Session');
const Device = require('../models/Device');
const { comparePassword, hashPassword } = require('../utils/password');
const { signAccessToken } = require('../utils/jwt');
const { registerOrFindDevice } = require('./device.service');
const createError = require('../utils/createError');
const { DUMMY_BCRYPT_HASH } = require('../config/constants');
const logger = require('../utils/logger');

/** SHA-256 hex digest of a string. Used for refresh token hashing. */
function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/** Generate a cryptographically random 40-byte refresh token (80 hex chars). */
function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

/** How many ms until the refresh token expires */
function refreshExpiryMs() {
  const days = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '30', 10);
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Login — single compound DB query, atomic device registration.
 *
 * @param {object} opts
 * @param {string} opts.accountCode
 * @param {string} opts.username      (already lowercase from Zod transform)
 * @param {string} opts.password
 * @param {string} opts.deviceUUID
 * @param {string} [opts.deviceName]
 * @param {string} [opts.userAgent]
 * @param {string} [opts.ipAddress]
 * @returns {{ accessToken, rawRefreshToken, account, session, device, isNewDevice }}
 */
async function loginUser({ accountCode, username, password, deviceUUID, deviceName, userAgent, ipAddress }) {
  // ── 1. Single compound lookup (uses { accountCode, username } index) ─────────
  const account = await Account.findOne({
    accountCode,
    username,          // already lowercase from Zod transform
    isActive: true,
  }).select('+passwordHash +passwordChangedAt');

  // ── 2. Password verification (constant-time even when account not found) ─────
  // Always run bcrypt.compare to prevent timing-based account enumeration.
  const hashToCompare = account ? account.passwordHash : DUMMY_BCRYPT_HASH;
  const passwordValid = await comparePassword(password, hashToCompare);

  if (!account || !passwordValid) {
    // Caller is responsible for recording the rate-limit failure
    throw createError(401, 'INVALID_CREDENTIALS', 'Invalid credentials.');
  }

  // ── 3. Atomic device check + registration ────────────────────────────────────
  const { device, isNewDevice } = await registerOrFindDevice({
    accountId: account._id,
    deviceLimit: account.deviceLimit,
    deviceUUID,
    deviceName,
    userAgent,
  });

  // ── 4. Create session ────────────────────────────────────────────────────────
  const rawRefreshToken = generateRefreshToken();
  const refreshTokenHash = sha256(rawRefreshToken);
  const expiresAt = new Date(Date.now() + refreshExpiryMs());

  const pca = account.passwordChangedAt ? account.passwordChangedAt.getTime() : 0;

  const session = await Session.create({
    accountId: account._id,
    deviceId: device._id,
    refreshTokenHash,
    accountPasswordChangedAt: account.passwordChangedAt || new Date(0),
    expiresAt,
    ipAddress: ipAddress || null,
    userAgent: userAgent ? userAgent.slice(0, 500) : null,
    isRevoked: false,
  });

  // ── 5. Sign JWT ──────────────────────────────────────────────────────────────
  const accessToken = signAccessToken({
    sub: account._id.toString(),
    did: device._id.toString(),
    sid: session._id.toString(),
    pca,
  });

  logger.info('Login successful', {
    accountId: account._id.toString(),
    deviceId: device._id.toString(),
    isNewDevice,
    ipAddress,
  });

  return { accessToken, rawRefreshToken, account, session, device, isNewDevice };
}

/**
 * Refresh session — rotate refresh token, issue new access token.
 * The old refresh token hash is replaced; presenting the old token again fails.
 *
 * @param {string} rawToken   — raw value from httpOnly cookie
 * @param {string} deviceUUID — from X-Device-ID header
 * @returns {{ accessToken, rawRefreshToken }}
 */
async function refreshSession(rawToken, deviceUUID) {
  if (!rawToken) {
    throw createError(401, 'SESSION_NOT_FOUND', 'No refresh token provided.');
  }

  const hash = sha256(rawToken);

  // Find session by hashed token
  const session = await Session.findOne({
    refreshTokenHash: hash,
    isRevoked: false,
  }).select('+refreshTokenHash');

  if (!session) {
    throw createError(401, 'SESSION_NOT_FOUND', 'Invalid or expired session.');
  }

  if (session.expiresAt < new Date()) {
    throw createError(401, 'SESSION_EXPIRED', 'Session has expired.');
  }

  // Verify the device UUID matches the session's device
  const device = await Device.findOne({
    _id: session.deviceId,
    accountId: session.accountId,
    deviceUUID,
    isActive: true,
  });

  if (!device) {
    // Device was revoked — revoke this session too
    await Session.findByIdAndUpdate(session._id, { $set: { isRevoked: true } });
    throw createError(401, 'SESSION_REVOKED', 'Device session has been revoked.');
  }

  // ── Rotate refresh token ─────────────────────────────────────────────────────
  const newRawToken = generateRefreshToken();
  const newHash = sha256(newRawToken);

  await Session.findByIdAndUpdate(session._id, {
    $set: { refreshTokenHash: newHash, lastActiveAt: new Date() },
  });

  // Update device lastActiveAt (throttled in production but fine here for correctness)
  await Device.findByIdAndUpdate(device._id, { $set: { lastActiveAt: new Date() } });

  // Use pca stored in session (no Account load needed)
  const pca = session.accountPasswordChangedAt
    ? session.accountPasswordChangedAt.getTime()
    : 0;

  const accessToken = signAccessToken({
    sub: session.accountId.toString(),
    did: session.deviceId.toString(),
    sid: session._id.toString(),
    pca,
  });

  return { accessToken, rawRefreshToken: newRawToken };
}

/**
 * Logout — revoke the current session.
 */
async function logoutUser(sessionId) {
  await Session.findByIdAndUpdate(sessionId, { $set: { isRevoked: true } });
}

/**
 * Change password.
 * 1. Verify current password.
 * 2. Hash new password.
 * 3. Update account.passwordHash + passwordChangedAt.
 * 4. Revoke ALL other sessions.
 * 5. Update the CURRENT session's accountPasswordChangedAt so it stays valid.
 *
 * @returns {{ sessionsRevoked: number }}
 */
async function changePassword({ accountId, currentSessionId, currentPassword, newPassword }) {
  const account = await Account.findById(accountId).select('+passwordHash +passwordChangedAt');
  if (!account) {
    throw createError(404, 'NOT_FOUND', 'Account not found.');
  }

  const valid = await comparePassword(currentPassword, account.passwordHash);
  if (!valid) {
    throw createError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
  }

  const newHash = await hashPassword(newPassword);
  const newPca = new Date();

  account.passwordHash = newHash;
  account.passwordChangedAt = newPca;
  await account.save();

  // Revoke all sessions EXCEPT the current one
  const revokeResult = await Session.updateMany(
    { accountId, _id: { $ne: currentSessionId }, isRevoked: false },
    { $set: { isRevoked: true } },
  );

  // Update current session's accountPasswordChangedAt so pca check keeps passing
  await Session.findByIdAndUpdate(currentSessionId, {
    $set: { accountPasswordChangedAt: newPca },
  });

  logger.info('Password changed', {
    accountId: accountId.toString(),
    sessionsRevoked: revokeResult.modifiedCount,
  });

  return { sessionsRevoked: revokeResult.modifiedCount };
}

module.exports = { loginUser, refreshSession, logoutUser, changePassword };
