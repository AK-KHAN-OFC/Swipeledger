'use strict';

const logger = require('../utils/logger');
const { RATE_LIMIT } = require('../config/constants');

/**
 * In-memory store for failed login attempts.
 *
 * WHY CUSTOM INSTEAD OF express-rate-limit:
 * The spec requires counting FAILED logins only (not total requests).
 * express-rate-limit's skip function runs BEFORE the handler resolves,
 * so checking res.statusCode there always sees the initial status (200),
 * not the final response status. The only correct approach is to increment
 * the counter manually in the controller after a confirmed failure.
 *
 * For production at scale, replace the Map with a Redis-backed store.
 * The interface (checkLimit / recordFailure) is unchanged.
 */
class FailedLoginStore {
  constructor() {
    this.store = new Map();
    // Periodic cleanup to prevent unbounded memory growth
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
    // Prevent the interval from keeping the process alive
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  _cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      logger.debug('Rate limiter cleanup', { removed, remaining: this.store.size });
    }
  }

  /**
   * Check whether the key has exceeded its limit.
   * @returns {{ exceeded: boolean, retryAfterSecs: number }}
   */
  checkLimit(key, maxFailures) {
    const entry = this.store.get(key);
    if (!entry || Date.now() >= entry.resetAt) return { exceeded: false, retryAfterSecs: 0 };
    if (entry.count >= maxFailures) {
      return {
        exceeded: true,
        retryAfterSecs: Math.ceil((entry.resetAt - Date.now()) / 1000),
      };
    }
    return { exceeded: false, retryAfterSecs: 0 };
  }

  /**
   * Record a failed login attempt for the given key.
   * Called by the auth controller AFTER a confirmed failure.
   */
  recordFailure(key, windowMs) {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now >= existing.resetAt) {
      // Start a new window
      this.store.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      existing.count += 1;
      this.store.set(key, existing);
    }
  }

  /**
   * Reset the counter for a key (e.g. after a successful login — optional,
   * but keeps the quota accurate for the user's own re-login after mistakes).
   */
  reset(key) {
    this.store.delete(key);
  }

  /** For testing: expose current count */
  getCount(key) {
    const entry = this.store.get(key);
    if (!entry || Date.now() >= entry.resetAt) return 0;
    return entry.count;
  }

  /**
   * Stop the cleanup interval. Call this in test teardown (afterAll) to
   * prevent Jest from hanging on the open setInterval handle.
   * unref() suppresses the handle during normal test runs, but Jest's
   * --detectOpenHandles and some CI environments still report it; an
   * explicit clearInterval is the definitive fix.
   */
  destroy() {
    clearInterval(this._cleanupInterval);
  }
}

const store = new FailedLoginStore();

/**
 * Derive rate-limit keys from a request.
 * Both keys are normalised to lowercase to prevent case-sensitivity bypasses.
 */
function getKeys(req) {
  const ipKey = `ip:${req.ip || 'unknown'}`;
  const body = req.body || {};
  const acctKey = `acct:${String(body.accountCode || '').toLowerCase()}:${String(body.username || '').toLowerCase()}`;
  return { ipKey, acctKey };
}

/**
 * Middleware that CHECKS the rate limits before the login handler runs.
 * Rejects with 429 if either the IP or account limit is exceeded.
 */
function loginRateLimitCheck(req, res, next) {
  const { ipKey, acctKey } = getKeys(req);

  const ipCheck = store.checkLimit(ipKey, RATE_LIMIT.IP_MAX_FAILURES);
  if (ipCheck.exceeded) {
    logger.warn('Login rate limit exceeded (IP)', { ip: req.ip, requestId: req.id });
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many failed login attempts. Please try again in ${ipCheck.retryAfterSecs} seconds.`,
        requestId: req.id,
      },
    });
  }

  const acctCheck = store.checkLimit(acctKey, RATE_LIMIT.ACCOUNT_MAX_FAILURES);
  if (acctCheck.exceeded) {
    logger.warn('Login rate limit exceeded (account)', {
      accountCode: (req.body || {}).accountCode,
      requestId: req.id,
    });
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Too many failed login attempts for this account. Please try again in ${acctCheck.retryAfterSecs} seconds.`,
        requestId: req.id,
      },
    });
  }

  next();
}

/**
 * Record a failed login. Called by the auth controller after a confirmed failure.
 * Must NOT be called on successful logins.
 */
function recordLoginFailure(req) {
  const { ipKey, acctKey } = getKeys(req);
  store.recordFailure(ipKey, RATE_LIMIT.IP_WINDOW_MS);
  store.recordFailure(acctKey, RATE_LIMIT.ACCOUNT_WINDOW_MS);
}

/**
 * Reset rate limit counters for a request (called after successful login).
 * Optional — keeps quota accurate for legitimate users correcting typos.
 */
function resetLoginCounters(req) {
  const { ipKey, acctKey } = getKeys(req);
  store.reset(ipKey);
  store.reset(acctKey);
}

/** Expose the raw store for testing purposes */
function getStore() {
  return store;
}

/** Stop the cleanup interval — call in test afterAll to avoid open-handle warnings */
function destroyStore() {
  store.destroy();
}

module.exports = { loginRateLimitCheck, recordLoginFailure, resetLoginCounters, getStore, destroyStore };
