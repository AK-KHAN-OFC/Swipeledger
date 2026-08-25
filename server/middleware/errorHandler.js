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

    // TEMPORARY DIAGNOSTIC — test environment only. Remove before merging to main.
    // Winston is silent in NODE_ENV=test, so real exceptions are invisible in CI.
    // This writes directly to stderr so the actual error surfaces in CI logs.
    if (process.env.NODE_ENV === 'test') {
      const mongoose = require('mongoose');
      const conn = mongoose.connection;
      process.stderr.write(
        '[DIAG 500]\n' +
        'errName:             ' + (err.name || '') + '\n' +
        'errMessage:          ' + (err.message || '') + '\n' +
        'errCode:             ' + (err.code || '') + '\n' +
        'mongoReadyState:     ' + conn.readyState + '\n' +
        'mongoConnectionHost: ' + (conn.host || '') + '\n' +
        'mongoConnectionName: ' + (conn.name || '') + '\n' +
        'route:               ' + req.method + ' ' + req.path + '\n' +
        'stack:\n' + (err.stack || '') + '\n' +
        '---\n',
      );
    }
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
