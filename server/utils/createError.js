'use strict';

/**
 * Create an error with HTTP status and application error code.
 * Thrown errors bubble up to the centralized errorHandler middleware.
 *
 * @param {number} status - HTTP status code
 * @param {string} code   - Application error code (e.g. 'INVALID_CREDENTIALS')
 * @param {string} message - User-facing message (no internal details)
 */
function createError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

module.exports = createError;
