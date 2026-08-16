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
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/scripts/**',
    '!server/index.js',
  ],
};
