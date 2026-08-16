'use strict';

// Load .env first (no-op in production where env vars are set externally)
require('dotenv').config();

// Validate all required environment variables before anything else
const { validateEnv } = require('./config/env');
validateEnv();

const mongoose = require('mongoose');
const connectDB = require('./config/db');
const app = require('./app');
const logger = require('./utils/logger');

let server;

async function start() {
  try {
    await connectDB();

    const PORT = parseInt(process.env.PORT || '10000', 10);
    server = app.listen(PORT, () => {
      logger.info(`SwipeLedger API running`, {
        port: PORT,
        env: process.env.NODE_ENV,
        pid: process.pid,
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

/**
 * Graceful shutdown.
 * Render (and most PaaS hosts) send SIGTERM before killing the process.
 * Stop accepting new connections, wait for in-flight requests to complete,
 * then close the MongoDB connection before exiting.
 */
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error('Error closing MongoDB connection', { error: err.message });
      }
      process.exit(0);
    });

    // Force exit if graceful shutdown takes too long (10 s)
    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Handle unhandled rejections — log and exit cleanly
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

start();
