'use strict';

module.exports = {
  testEnvironment: 'node',
  rootDir: '../',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/helpers/env.setup.js'],

  // 60 s applies to individual tests AND beforeAll/afterAll hooks (Jest ≥ 27).
  // MongoMemoryReplSet.create() can take 20-30 s on a cold machine.
  testTimeout: 60000,

  // NOTE: runInBand is a CLI-only flag; it is NOT a valid jest.config key and
  // is silently ignored here. The --runInBand flag in package.json scripts is
  // what actually controls serial execution.

  clearMocks: true,
  restoreMocks: true,

  // ── Singleton mongoose fix ────────────────────────────────────────────────
  // The project has two separate npm package trees (root/ and server/), so
  // `npm ci` installs mongoose in BOTH root/node_modules AND server/node_modules.
  // Each installation is a separate Node.js module singleton. When db.js calls
  // mongoose.connect() it connects root's singleton; but server models
  // (Counter, Account, Session, etc.) register against server's singleton, which
  // is never connected → "buffering timed out after 10000ms".
  //
  // moduleNameMapper intercepts require('mongoose') in every file Jest loads
  // (test files AND all server files required by tests) and redirects them all
  // to server/node_modules/mongoose. This guarantees a single connected
  // singleton is shared by db.js and every server model during test runs.
  moduleNameMapper: {
    '^mongoose$': '<rootDir>/server/node_modules/mongoose',
  },

  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/scripts/**',
    '!server/index.js',
  ],
};
