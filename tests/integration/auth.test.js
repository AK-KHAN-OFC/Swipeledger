'use strict';

const request    = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { connectTestDB, disconnectTestDB, clearCollections } = require('../helpers/db');
const { createTestAccount, TEST_PASSWORD } = require('../helpers/fixtures');

let app;
const DEVICE_ID = uuidv4();

// 60 s explicit timeout: MongoMemoryReplSet.create() can take 20-30 s cold.
beforeAll(async () => {
  await connectTestDB();
  app = require('../../server/app');
}, 60000);

afterAll(() => disconnectTestDB(), 30000);
afterEach(() => clearCollections());

// ── Login ─────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  test('returns 400 when X-Device-ID header is missing', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DEVICE_ID');
  });

  test('returns 400 when X-Device-ID is not a UUID v4', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', 'not-a-uuid')
      .send({ accountCode: 'AAAA-AAAA-AAAA', username: 'admin', password: 'pass12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DEVICE_ID');
  });

  test('returns 400 for invalid accountCode format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: 'bad-code', username: 'admin', password: 'pass12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('returns 401 INVALID_CREDENTIALS for wrong accountCode', async () => {
    await createTestAccount();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: 'ZZZZ-ZZZZ-ZZZZ', username: 'testadmin', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('returns 401 INVALID_CREDENTIALS for wrong username', async () => {
    const { account } = await createTestAccount();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'wronguser', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('returns 401 INVALID_CREDENTIALS for wrong password', async () => {
    const { account } = await createTestAccount();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('returns 401 INVALID_CREDENTIALS for inactive account', async () => {
    const { account } = await createTestAccount({ isActive: false });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('wrong accountCode and wrong password produce the SAME error code (no enumeration)', async () => {
    const { account } = await createTestAccount();
    const [r1, r2, r3] = await Promise.all([
      request(app).post('/api/v1/auth/login').set('X-Device-ID', DEVICE_ID)
        .send({ accountCode: 'ZZZZ-ZZZZ-ZZZZ', username: 'testadmin', password: TEST_PASSWORD }),
      request(app).post('/api/v1/auth/login').set('X-Device-ID', DEVICE_ID)
        .send({ accountCode: account.accountCode, username: 'wronguser', password: TEST_PASSWORD }),
      request(app).post('/api/v1/auth/login').set('X-Device-ID', DEVICE_ID)
        .send({ accountCode: account.accountCode, username: 'testadmin', password: 'wrongpass123' }),
    ]);
    expect(r1.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(r2.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(r3.body.error.code).toBe('INVALID_CREDENTIALS');
    // All must be 401
    expect([r1.status, r2.status, r3.status]).toEqual([401, 401, 401]);
  });

  test('successful login returns accessToken and sets httpOnly cookie', async () => {
    const { account } = await createTestAccount();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.account.accountCode).toBe(account.accountCode);
    expect(res.body.data.account).not.toHaveProperty('passwordHash');

    // Verify httpOnly cookie is set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = cookies.find((c) => c.startsWith('swipeledger_refresh'));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/SameSite=Lax/i);
  });

  test('username is normalized to lowercase on login', async () => {
    const { account } = await createTestAccount({ username: 'testadmin' });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'TESTADMIN', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/logout', () => {
  async function loginAndGetTokens(account) {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });
    return { accessToken: res.body.data.accessToken, cookie: res.headers['set-cookie'] };
  }

  test('logout returns 200 and clears cookie', async () => {
    const { account } = await createTestAccount();
    const { accessToken } = await loginAndGetTokens(account);

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('X-Device-ID', DEVICE_ID)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

  test('logout without auth token returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('X-Device-ID', DEVICE_ID);
    expect(res.status).toBe(401);
  });

  test('using revoked session after logout returns 401', async () => {
    const { account } = await createTestAccount();
    const { accessToken } = await loginAndGetTokens(account);

    // Logout
    await request(app)
      .post('/api/v1/auth/logout')
      .set('X-Device-ID', DEVICE_ID)
      .set('Authorization', `Bearer ${accessToken}`);

    // Try to use the old token — session is now revoked
    const res = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', DEVICE_ID)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
  });
});

// ── Refresh ───────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/refresh', () => {
  test('refresh with valid cookie returns new access token', async () => {
    const { account } = await createTestAccount();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });

    const cookie = loginRes.headers['set-cookie'];
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Device-ID', DEVICE_ID)
      .set('Cookie', cookie);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeTruthy();
    // New token should be different from original
    expect(refreshRes.body.data.accessToken).not.toBe(loginRes.body.data.accessToken);
  });

  test('refresh rotates the cookie (new token issued)', async () => {
    const { account } = await createTestAccount();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });

    const cookie1 = loginRes.headers['set-cookie'];
    const r2 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Device-ID', DEVICE_ID)
      .set('Cookie', cookie1);

    const cookie2 = r2.headers['set-cookie'];
    // Old cookie value should not work again (rotation)
    const r3 = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Device-ID', DEVICE_ID)
      .set('Cookie', cookie1); // old cookie

    expect(r3.status).toBe(401);
  });

  test('refresh without cookie returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Device-ID', DEVICE_ID);
    expect(res.status).toBe(401);
  });

  test('refresh with wrong device ID returns 401', async () => {
    const { account } = await createTestAccount();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });

    const cookie = loginRes.headers['set-cookie'];
    const differentDevice = uuidv4();

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('X-Device-ID', differentDevice)  // different device
      .set('Cookie', cookie);

    expect(res.status).toBe(401);
  });
});

// ── Change Password ───────────────────────────────────────────────────────────
describe('POST /api/v1/auth/change-password', () => {
  test('successfully changes password and revokes other sessions', async () => {
    const { account } = await createTestAccount();

    // Login from two devices
    const device1 = uuidv4();
    const device2 = uuidv4();

    const r1 = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', device1)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });

    const r2 = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', device2)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });

    const token1 = r1.body.data.accessToken;
    const token2 = r2.body.data.accessToken;

    // Change password from device 1
    const changeRes = await request(app)
      .post('/api/v1/auth/change-password')
      .set('X-Device-ID', device1)
      .set('Authorization', `Bearer ${token1}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewPassword456!' });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body.data.sessionsRevoked).toBeGreaterThanOrEqual(1);

    // Device 2's token should now be rejected (session revoked)
    const protectedRes = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', device2)
      .set('Authorization', `Bearer ${token2}`);

    expect(protectedRes.status).toBe(401);
  });

  test('rejects wrong current password', async () => {
    const { account } = await createTestAccount();
    const { body: { data: { accessToken } } } = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('X-Device-ID', DEVICE_ID)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'wrongpassword', newPassword: 'NewPassword456!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('new password must be at least 8 characters', async () => {
    const { account } = await createTestAccount();
    const { body: { data: { accessToken } } } = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', DEVICE_ID)
      .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('X-Device-ID', DEVICE_ID)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
