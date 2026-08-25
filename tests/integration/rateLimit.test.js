'use strict';

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { connectTestDB, disconnectTestDB, clearCollections } = require('../helpers/db');
const { createTestAccount, TEST_PASSWORD } = require('../helpers/fixtures');
const { getStore, destroyStore } = require('../../server/middleware/rateLimiter');
const { RATE_LIMIT } = require('../../server/config/constants');

let app;

beforeAll(async () => {
  await connectTestDB();
  app = require('../../server/app');
}, 60000);

afterAll(async () => {
  destroyStore();
  await disconnectTestDB();
}, 30000);

afterEach(async () => {
  await clearCollections();
  // Clear rate limit counters between tests
  const store = getStore();
  store.store.clear();
});

const DEVICE = uuidv4();

async function attemptLogin(accountCode, username, password) {
  return request(app)
    .post('/api/v1/auth/login')
    .set('X-Device-ID', DEVICE)
    .send({ accountCode, username, password });
}

describe('Rate limiting — failed logins only', () => {
  test('failed login increments the failure counter', async () => {
    const store = getStore();
    const { account } = await createTestAccount();

    await attemptLogin(account.accountCode, 'testadmin', 'wrongpass12345');

    const ipKey = `ip:${expect.any(String)}`;
    // Verify counter is non-zero after a failure
    const acctKey = `acct:${account.accountCode.toLowerCase()}:testadmin`;
    expect(store.getCount(acctKey)).toBe(1);
  });

  test('successful login does NOT increment the failure counter', async () => {
    const store = getStore();
    const { account } = await createTestAccount();

    await attemptLogin(account.accountCode, 'testadmin', TEST_PASSWORD);

    const acctKey = `acct:${account.accountCode.toLowerCase()}:testadmin`;
    expect(store.getCount(acctKey)).toBe(0);
  });

  test('account-level limit: 5 failures triggers 429 on 6th attempt', async () => {
    const { account } = await createTestAccount();

    // 5 failures
    for (let i = 0; i < RATE_LIMIT.ACCOUNT_MAX_FAILURES; i++) {
      const res = await attemptLogin(account.accountCode, 'testadmin', 'wrongpass12345');
      expect(res.status).toBe(401);
    }

    // 6th attempt — should be rate limited
    const res = await attemptLogin(account.accountCode, 'testadmin', 'wrongpass12345');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  test('rate limit is per account — different accounts have independent counters', async () => {
    const store = getStore();

    const { account: a1 } = await createTestAccount({ username: 'userone' });
    const { account: a2 } = await createTestAccount({
      username: 'usertwo',
      accountCode: 'BBBB-BBBB-BBBB',
    });

    // Exhaust account 1's limit
    for (let i = 0; i < RATE_LIMIT.ACCOUNT_MAX_FAILURES; i++) {
      await attemptLogin(a1.accountCode, 'userone', 'wrongpass');
    }

    // Account 2 should still be allowed
    const res = await attemptLogin(a2.accountCode, 'usertwo', 'wrongpass');
    expect(res.status).toBe(401); // INVALID_CREDENTIALS, not RATE_LIMITED
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('case-normalized account key: TESTADMIN and testadmin share the same counter', async () => {
    const store = getStore();
    const { account } = await createTestAccount({ username: 'testadmin' });

    // Failed attempts with mixed case
    await attemptLogin(account.accountCode, 'TESTADMIN', 'wrongpass');
    await attemptLogin(account.accountCode, 'TestAdmin', 'wrongpass');
    await attemptLogin(account.accountCode, 'testadmin', 'wrongpass');

    const acctKey = `acct:${account.accountCode.toLowerCase()}:testadmin`;
    expect(store.getCount(acctKey)).toBe(3);
  });

  test('rate limit response uses the standardized error format', async () => {
    const { account } = await createTestAccount();

    for (let i = 0; i < RATE_LIMIT.ACCOUNT_MAX_FAILURES; i++) {
      await attemptLogin(account.accountCode, 'testadmin', 'wrongpass');
    }

    const res = await attemptLogin(account.accountCode, 'testadmin', 'wrongpass');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: expect.any(String),
        requestId: expect.any(String),
      },
    });
  });

  test('after the window expires, counter resets and login is allowed', async () => {
    // Use a very short window for this test by directly manipulating the store
    const store = getStore();
    const { account } = await createTestAccount();
    const acctKey = `acct:${account.accountCode.toLowerCase()}:testadmin`;

    // Manually set an expired entry to simulate window expiry
    store.store.set(acctKey, { count: RATE_LIMIT.ACCOUNT_MAX_FAILURES + 1, resetAt: Date.now() - 1 });

    // Should now be allowed (window expired)
    const res = await attemptLogin(account.accountCode, 'testadmin', TEST_PASSWORD);
    expect(res.status).toBe(200); // successful login, counter expired
  });
});
