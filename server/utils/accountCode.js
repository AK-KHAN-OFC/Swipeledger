'use strict';

const crypto = require('crypto');
const { ACCOUNT_CODE_CHARS } = require('../config/constants');

/**
 * Generate a server-side account code in the format XXXX-XXXX-XXXX.
 * 12 uppercase alphanumeric characters → 36^12 ≈ 4.7×10^18 combinations.
 * Uses cryptographically secure randomness (crypto.randomInt).
 */
function generateAccountCode() {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) {
      group += ACCOUNT_CODE_CHARS[crypto.randomInt(0, ACCOUNT_CODE_CHARS.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

module.exports = { generateAccountCode };
