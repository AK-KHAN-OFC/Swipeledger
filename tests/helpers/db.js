'use strict';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let replSet;

/**
 * Start an in-memory MongoDB replica set and connect mongoose.
 * A replica set (not a standalone) is required for MongoDB transactions,
 * which are used in the atomic device registration flow.
 */
async function connectTestDB() {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
  });

  const uri = replSet.getUri();
  process.env.MONGODB_URI = uri; // expose to any server module that reads this

  await mongoose.connect(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 10000,
  });

  return uri;
}

async function disconnectTestDB() {
  await mongoose.connection.dropDatabase();
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
