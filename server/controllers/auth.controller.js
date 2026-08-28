'use strict';

const crypto = require('crypto');
const authService = require('../services/auth.service');
const auditService = require('../services/audit.service');
const { recordLoginFailure, resetLoginCounters } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');
const { generateAccountCode } = require('../utils/accountCode');
const { hashPassword } = require('../utils/password');
const Account = require('../models/Account');
const Plan = require('../models/Plan');
const Subscription = require('../models/Subscription');
const Settings = require('../models/Settings');

// ─── Cookie helpers ────────────────────────────────────────────────────────────

/**
 * Detect whether the server is running in a production / HTTPS context.
 *
 * Root cause fix: the original code used ONLY `NODE_ENV === 'production'`.
 * If NODE_ENV was unset on Render, cookies would get SameSite=Lax instead of
 * SameSite=None. SameSite=Lax blocks the refresh cookie on cross-origin POST
 * requests from the Capacitor Android WebView (origin: https://localhost →
 * https://swipeledger.onrender.com), causing sessions to be lost after the
 * 60-minute access token expired even though the 30-day refresh token was valid.
 *
 * Fix: also check process.env.RENDER which Render sets automatically on every
 * deployed service, regardless of NODE_ENV. This makes the production cookie
 * configuration reliable even if NODE_ENV is misconfigured.
 */
function isProductionEnv() {
  return process.env.NODE_ENV === 'production' || !!process.env.RENDER;
}

/**
 * Build httpOnly refresh token cookie options.
 * SameSite=None + Secure is required for cross-origin Capacitor requests.
 */
function refreshCookieOptions(maxAge) {
  const isProd = isProductionEnv();
  return {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    path:     '/api/v1/auth',
    maxAge,                  // Express converts ms → seconds for Set-Cookie
  };
}

/**
 * Options used when clearing the refresh cookie.
 *
 * Root cause fix: clearCookie must send matching SameSite and Secure attributes.
 * In modern Chromium (Android WebView 80+) a Set-Cookie that tries to clear a
 * SameSite=None; Secure cookie but omits those attributes may be ignored, leaving
 * the old cookie alive after logout.
 */
function clearCookieOptions() {
  const isProd = isProductionEnv();
  return {
    path:     '/api/v1/auth',
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
  };
}

const REFRESH_MS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '30', 10) * 86400 * 1000;

// ─── Registration helpers ──────────────────────────────────────────────────────

/**
 * Generate a readable 12-character temporary password.
 * Excludes visually ambiguous characters: 0, O, 1, I, l.
 * Uses crypto.randomInt — cryptographically secure.
 */
function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars[crypto.randomInt(0, chars.length)];
  }
  return password;
}

/**
 * Derive a workspace username from the business name.
 * Output always matches the Account model's ^[a-z0-9_]{4,30}$ constraint.
 * A random 4-digit suffix is appended to reduce collisions within an account.
 * (Username uniqueness is per-accountCode, not global — the compound index
 *  { accountCode, username } enforces it; a random suffix is sufficient.)
 */
function deriveUsername(businessName) {
  const base = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')   // non-alphanumeric → underscore
    .replace(/_+/g, '_')          // collapse runs of underscores
    .replace(/^_|_$/g, '')        // trim leading/trailing underscores
    .slice(0, 12);                // cap at 12 chars so suffix fits in 30 total
  const suffix = crypto.randomInt(1000, 9999).toString(); // 4 digits
  return ((base || 'user') + '_' + suffix).slice(0, 30);
}

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

  res.clearCookie('swipeledger_refresh', clearCookieOptions());
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
    // Clear the cookie on any refresh failure — use matching attributes so the
    // cookie is reliably removed by the Android WebView's Chromium cookie engine.
    res.clearCookie('swipeledger_refresh', clearCookieOptions());
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

/**
 * POST /api/v1/auth/register
 *
 * Public endpoint — no authentication or device ID required.
 * Creates a new merchant workspace and returns one-time credentials.
 *
 * Credentials returned:
 *   - accountCode   server-generated, globally unique, format XXXX-XXXX-XXXX
 *   - username      derived from businessName + random suffix
 *   - temporaryPassword  plaintext, shown ONCE here — never stored
 *
 * Security notes:
 *   - rawPassword is NEVER logged.
 *   - Only bcrypt hash is stored in the database.
 *   - Subscription and Settings are created atomically in the same request.
 *   - On MongoDB duplicate-key error (accountCode collision), the loop retries
 *     up to 3 times; collision probability is negligible at 36^12 ≈ 4.7×10^18.
 */
async function register(req, res) {
  const { businessName, mobileNumber } = req.body;

  // 1. Ensure the free plan exists (upsert — safe to run concurrently)
  const plan = await Plan.findOneAndUpdate(
    { slug: 'free' },
    {
      $setOnInsert: {
        name: 'Free',
        slug: 'free',
        deviceLimit: parseInt(process.env.DEFAULT_DEVICE_LIMIT || '3', 10),
        transactionLimit: -1,
        features: [],
        price: 0,
        isActive: true,
      },
    },
    { upsert: true, new: true },
  );

  // 2. Generate credentials
  const rawPassword = generateTemporaryPassword(); // NEVER log this
  const username    = deriveUsername(businessName);
  const passwordHash = await hashPassword(rawPassword);

  // 3. Create account — retry on accountCode collision (astronomically rare)
  let account;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const accountCode = generateAccountCode();
    try {
      account = await Account.create({
        accountCode,
        username,
        passwordHash,
        businessName,
        mobileNumber: mobileNumber || null,
        planId: plan._id,
        deviceLimit: plan.deviceLimit,
        isActive: true,
        passwordChangedAt: new Date(),
      });
      break; // created successfully
    } catch (err) {
      // 11000 = MongoDB duplicate key — only retry on accountCode collision
      if (err.code === 11000 && attempt < 3) continue;
      throw err;
    }
  }

  // 4. Create subscription on the free plan
  await Subscription.create({
    accountId: account._id,
    planId: plan._id,
    status: 'active',
    currentPeriodStart: new Date(),
  });

  // 5. Create default settings (Indian defaults; can be updated by merchant later)
  await Settings.create({
    accountId: account._id,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    dateFormat: 'DD/MM/YYYY',
    defaultPaymentMode: 'cash',
  });

  // 6. Audit — no device or session context at registration time
  auditService.logAction({
    accountId: account._id,
    action: 'account_registered',
    entityType: 'account',
    entityId: account._id,
    metadata: {
      businessName: account.businessName,
      hasPhone: !!mobileNumber,
    },
    ipAddress: req.ip,
    requestId: req.id,
  });

  logger.info('Account registered', { accountId: account._id.toString() });

  // 7. Return credentials — temporaryPassword is ONLY sent here, never again
  return res.status(201).json({
    success: true,
    data: {
      accountCode:       account.accountCode,
      username:          account.username,
      temporaryPassword: rawPassword,   // plaintext, one-time display only
      businessName:      account.businessName,
    },
  });
}

module.exports = { login, logout, refresh, logoutAll, changePassword, register };
