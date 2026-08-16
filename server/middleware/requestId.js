'use strict';

const { randomUUID } = require('crypto');

/**
 * Attach a correlation ID to every request.
 * Uses the client-provided X-Request-ID if it is a valid UUID,
 * otherwise generates a new UUID. Always echoes the ID in the response header.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  req.id = incoming && UUID_REGEX.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
};
