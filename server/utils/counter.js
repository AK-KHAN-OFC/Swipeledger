'use strict';

const Counter = require('../models/Counter');

/**
 * Atomically increment and return the next sequence number for a given
 * accountId + type combination. Thread-safe under concurrent requests.
 *
 * @param {string|ObjectId} accountId
 * @param {'customer'|'transaction'} type
 * @returns {Promise<number>} Next sequence number (starts at 1)
 */
async function getNextSequence(accountId, type) {
  const key = `${accountId}_${type}`;
  const result = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', new: true },
  );
  return result.seq;
}

/**
 * Format a customer ID from a sequence number.
 * e.g. getNextSequence(...) = 42 → "CUST-0042"
 */
async function nextCustomerId(accountId) {
  const seq = await getNextSequence(accountId, 'customer');
  return `CUST-${String(seq).padStart(4, '0')}`;
}

/**
 * Format a transaction ID from a sequence number.
 * e.g. getNextSequence(...) = 42 → "TXN-000042"
 */
async function nextTransactionId(accountId) {
  const seq = await getNextSequence(accountId, 'transaction');
  return `TXN-${String(seq).padStart(6, '0')}`;
}

module.exports = { getNextSequence, nextCustomerId, nextTransactionId };
