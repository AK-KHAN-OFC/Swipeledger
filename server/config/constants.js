'use strict';

module.exports = {
  // Account code format
  ACCOUNT_CODE_REGEX: /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
  ACCOUNT_CODE_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',

  // Device UUID format
  DEVICE_UUID_REGEX:
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // Rate limiting defaults (overrideable per environment)
  RATE_LIMIT: {
    IP_MAX_FAILURES: 10,
    IP_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    ACCOUNT_MAX_FAILURES: 5,
    ACCOUNT_WINDOW_MS: 15 * 60 * 1000,
  },

  // Session lastActiveAt throttle — only update once per N ms
  SESSION_ACTIVE_THROTTLE_MS: 5 * 60 * 1000, // 5 minutes

  // Dummy bcrypt hash used for constant-time comparison when account not found
  // This is a valid bcrypt hash of "dummy-timing-protection-value"
  DUMMY_BCRYPT_HASH:
    '$2b$12$LQMv5Py5n7HrVqvX1k0.OuKIaVcJeHrDH6kMmWAnGeMSFJEfKHb2',

  // Audit log retention in days (used for TTL index)
  AUDIT_LOG_TTL_DAYS: 90,

  // Plan slug for the free plan seed
  FREE_PLAN_SLUG: 'free',
};
