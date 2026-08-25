'use strict';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let replSet;

/**
 * Start an in-memory MongoDB replica set and connect mongoose.
 * A replica set (not a standalone) is required for MongoDB transactions,
 * which are used in the atomic device registration flow.
 *
 * Guards:
 * 1. Stops any previously leaked replSet before creating a new one (prevents
 *    mongod processes from accumulating when test files each call this).
 * 2. Disconnects mongoose before reconnecting to avoid "topology was destroyed"
 *    errors when a second test file starts after the first file's afterAll ran.
 * 3. Pings the admin DB after connect to confirm the primary is elected and the
 *    replica set is ready to accept transactions. Without this, the first test
 *    that calls mongoose.startSession() can race against replica-set election
 *    and throw a non-INVALID_CREDENTIALS error that bypasses recordLoginFailure
 *    and returns 500 instead of 401.
 */
async function connectTestDB() {
  // Stop any previously leaked replica set (e.g. prior test file didn't clean up)
  if (replSet) {
    await replSet.stop().catch(() => {});
    replSet = null;
  }

  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  const uri = replSet.getUri();
  process.env.MONGODB_URI = uri; // expose to any server module that reads this

  // Disconnect first if mongoose is still connected from a previous test file
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
  });

  // Block until the replica-set primary is elected and ready for transactions.
  // mongoose.connect() resolves as soon as the driver establishes a socket;
  // it does NOT wait for primary election. Without this ping, the first test
  // that hits registerOrFindDevice (which calls mongoose.startSession()) can
  // fail with a MongoServerSelectionError rather than the expected 401, causing
  // the errorHandler to return 500 and leaving rate-limit counters at 0.
  await mongoose.connection.db.admin().command({ ping: 1 });

  return uri;
}

async function disconnectTestDB() {
  // dropDatabase can throw if the DB was never created (e.g. beforeAll failed);
  // don't let that abort the rest of teardown.
  try {
    await mongoose.connection.dropDatabase();
  } catch (_) {}
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
    replSet = null;
  }
}

async function clearCollections() {
  const cols = Object.values(mongoose.connection.collections);
  await Promise.all(cols.map((c) => c.deleteMany({})));
}

module.exports = { connectTestDB, disconnectTestDB, clearCollections };
