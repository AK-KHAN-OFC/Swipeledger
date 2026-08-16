'use strict';

// Called once at server startup (index.js). Tests import app.js directly
// and set process.env vars themselves before any module loads.

const REQUIRED = [
  'NODE_ENV',
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRY',
  'REFRESH_TOKEN_EXPIRY_DAYS',
  'CLIENT_ORIGIN',
  'BCRYPT_ROUNDS',
];

function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`\nFATAL — Missing required environment variables:\n  ${missing.join('\n  ')}\n`);
    console.error('Copy .env.example to .env and fill in all values.\n');
    process.exit(1);
  }

  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32) {
    console.error('FATAL — JWT_SECRET must be at least 32 characters.');
    process.exit(1);
  }

  const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS, 10);
  if (Number.isNaN(bcryptRounds) || bcryptRounds < 4 || bcryptRounds > 20) {
    console.error('FATAL — BCRYPT_ROUNDS must be an integer between 4 and 20.');
    process.exit(1);
  }
}

module.exports = { validateEnv };
