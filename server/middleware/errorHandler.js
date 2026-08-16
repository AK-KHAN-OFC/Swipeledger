'use strict';

const logger = require('../utils/logger');

/**
 * Centralized error handling middleware.
 *
 * Rules:
 *  - Client errors (4xx): return err.message (already user-safe)
 *  - Server errors (5xx): log full details, return generic message
 *  - Stack traces: NEVER returned in responses
 *  - requestId: always included for user-reportable debugging
 */
module.exports = function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = typeof err.status === 'number' ? err.status : 500;
  const code = err.code || 'INTERNAL_ERROR';
  const isServerError = status >= 500;

  if (isServerError) {
    logger.error('Unhandled server error', {
      error: err.message,
      stack: err.stack,
      requestId: req.id,
      method: req.method,
      path: req.path,
      accountId: req.accountId?.toString(),
    });
  }

  const message = isServerError
    ? 'An unexpected error occurred. Please try again.'
    : err.message;

  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      requestId: req.id,
    },
  });
};
