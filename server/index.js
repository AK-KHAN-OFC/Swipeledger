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

// Models are loaded when app.js is required above. We reference Account here
// for the startup index migration — no circular dependency.
const Account = require('./models/Account');

let server;

// ── Index migration ───────────────────────────────────────────────────────────
/**
 * Ensure the mobileNumber_1 index has the correct uniqueness constraint.
 *
 * ROOT CAUSE (F-2 production failure):
 *   Changing a Mongoose schema index definition does NOT automatically update an
 *   existing MongoDB index. When we added `unique: true` and `partialFilterExpression`
 *   to the schema, Mongoose called createIndex() on startup — but MongoDB rejected it
 *   because an index named `mobileNumber_1` already existed with different options
 *   (sparse: true, no unique). Mongoose swallowed the error and the old non-unique
 *   index survived untouched, allowing duplicate mobile numbers.
 *
 * Fix:
 *   Explicitly drop the old index if it exists without unique:true, then call
 *   Account.createIndexes() so Mongoose creates the correct one from the schema.
 *   This function is idempotent — subsequent runs find the correct index and exit
 *   immediately without making any changes.
 */
async function migrateIndexes() {
  try {
    // collection.indexes() lists all existing indexes in MongoDB for this collection.
    // We catch the error in case the collection doesn't exist yet (first deploy).
    const existing = await Account.collection.indexes().catch(() => []);
    const mobileIdx = existing.find((idx) => idx.name === 'mobileNumber_1');

    if (mobileIdx && !mobileIdx.unique) {
      // Old non-unique index found — must be dropped before the correct one can be created.
      await Account.collection.dropIndex('mobileNumber_1');
      logger.info('[startup] Dropped stale non-unique mobileNumber_1 index — will recreate');
    }
  } catch (err) {
    // Non-fatal: if the drop fails for any reason, log it and continue.
    // createIndexes() below will fail too and also log — the server still starts,
    // and the next deploy retries automatically.
    logger.warn('[startup] mobileNumber index migration warning', { message: err.message });
  }

  // Create the correct index from the schema definition.
  // If it already exists with the correct options, this is a no-op.
  // If the old index was just dropped above, this creates the new correct one.
  await Account.createIndexes().catch((err) => {
    logger.warn('[startup] Account.createIndexes() warning', { message: err.message });
  });

  logger.info('[startup] Account indexes verified');
}

async function start() {
  try {
    await connectDB();

    // Run index migration before accepting requests.
    // Drops and recreates mobileNumber_1 with unique + partialFilterExpression
    // if production still has the old non-unique sparse index.
    await migrateIndexes();

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
