'use strict';

const bcrypt = require('bcrypt');

function getRounds() {
  return parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
}

/**
 * Hash a plaintext password. Returns the bcrypt hash string.
 * Never log the input or output.
 */
async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, getRounds());
}

/**
 * Compare a plaintext password against a stored bcrypt hash.
 * Constant-time comparison — safe against timing attacks.
 */
async function comparePassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

module.exports = { hashPassword, comparePassword };
