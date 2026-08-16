'use strict';

const morgan = require('morgan');
const logger = require('../utils/logger');

// Custom morgan token: correlation request ID
morgan.token('request-id', (req) => req.id || '-');

// Log format: requestId method path status responseTime ip
// NOTE: Never log query strings or request bodies — may contain credentials.
const FORMAT = ':request-id :method :url :status :response-time ms - :remote-addr';

const stream = {
  write: (message) => logger.http(message.trim()),
};

// Skip health check endpoint to reduce noise
const skip = (req) => req.path === '/health';

module.exports = morgan(FORMAT, { stream, skip });
