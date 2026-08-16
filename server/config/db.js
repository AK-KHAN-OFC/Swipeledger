'use strict';

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Connect to MongoDB with exponential-backoff retry.
 * @param {string} [uri] - Override URI (used in tests).
 */
async function connectDB(uri) {
  const dbUri = uri || process.env.MONGODB_URI;
  const MAX_RETRIES = 5;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(dbUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });

      // Mask credentials in log output
      const safeUri = dbUri.replace(/\/\/[^@]+@/, '//***:***@');
      logger.info('MongoDB connected', { uri: safeUri });
      return;
    } catch (err) {
      logger.error(`MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed`, {
        error: err.message,
      });
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
}

module.exports = connectDB;
