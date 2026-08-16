'use strict';

const authService = require('../services/auth.service');
const auditService = require('../services/audit.service');
const { recordLoginFailure, resetLoginCounters } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

/** Build httpOnly refresh token cookie options */
function refreshCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',           // SameSite=Lax: blocks cross-site POST, works on iOS PWA
    path: '/api/v1/auth',      // Cookie only sent to auth endpoints
    maxAge,                    // milliseconds
  };
}

const REFRESH_MS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '30', 10) * 86400 * 1000;

/**
 * POST /api/v1/auth/login
 */
async function login(req, res) {
  const { accountCode, username, password, deviceName } = req.body;
  const deviceUUID = req.deviceUUID;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  try {
    const { accessToken, rawRefreshToken, account, session, device, isNewDevice } =
      await authService.loginUser({
        accountCode, username, password,
        deviceUUID, deviceName, userAgent, ipAddress,
      });

    // Reset rate limit counters on successful login
    resetLoginCounters(req);

    // Audit: login
    auditService.logAction({
      accountId: account._id,
      deviceId: device._id,
      sessionId: session._id,
      action: 'login',
      entityType: 'account',
      entityId: account._id,
      metadata: {
        username: account.username,
        accountCode: account.accountCode,
        deviceName: device.name,
        platform: device.platform,
        isNewDevice,
      },
      ipAddress,
      requestId: req.id,
    });

    if (isNewDevice) {
      auditService.logAction({
        accountId: account._id,
        deviceId: device._id,
        sessionId: session._id,
        action: 'device_registered',
        entityType: 'device',
        entityId: device._id,
        metadata: { deviceName: device.name, platform: device.platform, browser: device.browser },
        ipAddress,
        requestId: req.id,
      });
    }

    res.cookie('swipeledger_refresh', rawRefreshToken, refreshCookieOptions(REFRESH_MS));

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        account: {
          accountId: account._id,
          accountCode: account.accountCode,
          username: account.username,
          businessName: account.businessName,
          deviceLimit: account.deviceLimit,
        },
      },
    });
  } catch (err) {
    if (err.code === 'INVALID_CREDENTIALS') {
      // Record rate-limit failure
      recordLoginFailure(req);

      // Audit: login_failed (fire-and-forget, best effort — no account/device context)
      auditService.logAction({
        accountId: null,
        action: 'login_failed',
        metadata: {
          reason: 'invalid_credentials',
          accountCode: accountCode || '',
          username: username || '',
        },
        ipAddress,
        requestId: req.id,
      });

      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: err.message, requestId: req.id },
      });
    }

    if (err.code === 'DEVICE_LIMIT_REACHED') {
      auditService.logAction({
        accountId: null,
        action: 'device_limit_reached',
        metadata: {
          limit: err.limit,
          accountCode: accountCode || '',
        },
        ipAddress,
        requestId: req.id,
      });

      return res.status(403).json({
        success: false,
        error: {
          code: 'DEVICE_LIMIT_REACHED',
          message: err.message,
          requestId: req.id,
        },
        data: {
          limit: err.limit,
          activeDevices: err.activeDevices || [],
        },
      });
    }

    throw err; // Let errorHandler deal with unexpected errors
  }
}

/**
 * POST /api/v1/auth/logout
 */
async function logout(req, res) {
  await authService.logoutUser(req.sessionId);

  auditService.logAction({
    accountId: req.accountId,
    deviceId: req.deviceId,
    sessionId: req.sessionId,
    action: 'logout',
    entityType: 'account',
    entityId: req.accountId,
    metadata: { reason: 'user_initiated' },
    ipAddress: req.ip,
    requestId: req.id,
  });

  res.clearCookie('swipeledger_refresh', { path: '/api/v1/auth' });
  return res.json({ success: true, data: { message: 'Logged out successfully.' } });
}

/**
 * POST /api/v1/auth/refresh
 */
async function refresh(req, res) {
  const rawToken = req.cookies?.swipeledger_refresh;
  const deviceUUID = req.deviceUUID;

  try {
    const { accessToken, rawRefreshToken } = await authService.refreshSession(rawToken, deviceUUID);

    res.cookie('swipeledger_refresh', rawRefreshToken, refreshCookieOptions(REFRESH_MS));

    return res.json({ success: true, data: { accessToken } });
  } catch (err) {
    // Clear the cookie on any refresh failure
    res.clearCookie('swipeledger_refresh', { path: '/api/v1/auth' });
    return res.status(401).json({
      success: false,
      error: {
        code: err.code || 'SESSION_NOT_FOUND',
        message: err.message || 'Session could not be refreshed.',
        requestId: req.id,
      },
    });
  }
}

/**
 * POST /api/v1/auth/logout-all
 * Revokes all sessions except the current one.
 */
async function logoutAll(req, res) {
  const { logoutOtherSessions } = require('../services/device.service');
  const revoked = await logoutOtherSessions({
    accountId: req.accountId,
    currentSessionId: req.sessionId,
  });

  auditService.logAction({
    accountId: req.accountId,
    deviceId: req.deviceId,
    sessionId: req.sessionId,
    action: 'logout',
    entityType: 'account',
    entityId: req.accountId,
    metadata: { reason: 'logout_all_others', sessionsRevoked: revoked },
    ipAddress: req.ip,
    requestId: req.id,
  });

  return res.json({ success: true, data: { sessionsRevoked: revoked } });
}

/**
 * POST /api/v1/auth/change-password
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  const { sessionsRevoked } = await authService.changePassword({
    accountId: req.accountId,
    currentSessionId: req.sessionId,
    currentPassword,
    newPassword,
  });

  auditService.logAction({
    accountId: req.accountId,
    deviceId: req.deviceId,
    sessionId: req.sessionId,
    action: 'password_changed',
    entityType: 'account',
    entityId: req.accountId,
    metadata: { sessionsRevoked },
    ipAddress: req.ip,
    requestId: req.id,
  });

  return res.json({ success: true, data: { message: 'Password changed successfully.', sessionsRevoked } });
}

module.exports = { login, logout, refresh, logoutAll, changePassword };
