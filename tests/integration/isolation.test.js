'use strict';

const request = require('supertest');
const { v4: uuidv4 } = require('uuid');
const { connectTestDB, disconnectTestDB, clearCollections } = require('../helpers/db');
const { createTestAccount, TEST_PASSWORD } = require('../helpers/fixtures');

let app;

beforeAll(async () => {
  await connectTestDB();
  app = require('../../server/app');
}, 60000);

afterAll(() => disconnectTestDB(), 30000);
afterEach(() => clearCollections());

// Uses account.username so tests that create accounts with non-default usernames
// ('userone', 'usertwo') still produce valid login credentials.
async function loginAs(account, deviceId = uuidv4()) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Device-ID', deviceId)
    .send({ accountCode: account.accountCode, username: account.username, password: TEST_PASSWORD });
  return { token: res.body.data?.accessToken, deviceId, cookie: res.headers['set-cookie'] };
}

// ── Account isolation ─────────────────────────────────────────────────────────
describe('Account isolation — cross-account access prevention', () => {
  test('account A cannot read account B settings', async () => {
    const { account: a } = await createTestAccount({ username: 'userone' });
    const { account: b } = await createTestAccount({ username: 'usertwo', accountCode: 'BBBB-BBBB-BBBB' });

    const { token, deviceId } = await loginAs(a);

    // Account A reads its OWN settings (scoped to req.accountId from JWT)
    const res = await request(app)
      .get('/api/v1/settings')
      .set('X-Device-ID', deviceId)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // The response settings MUST belong to account A, not account B
    const settingsAccountId = res.body.data.accountId;
    expect(String(settingsAccountId)).toBe(String(a._id));
    expect(String(settingsAccountId)).not.toBe(String(b._id));
  });

  test('account A cannot see account B devices', async () => {
    const { account: a } = await createTestAccount({ username: 'userone' });
    const { account: b } = await createTestAccount({ username: 'usertwo', accountCode: 'CCCC-CCCC-CCCC' });
    const deviceA = uuidv4();
    const deviceB = uuidv4();

    const { token } = await loginAs(a, deviceA);
    await loginAs(b, deviceB);

    const res = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', deviceA)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // Only account A's devices should appear
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isCurrent).toBe(true);
  });

  test('client-provided accountId in body is ignored — server uses JWT sub', async () => {
    const { account: a } = await createTestAccount({ username: 'userone' });
    const { account: b } = await createTestAccount({ username: 'usertwo', accountCode: 'DDDD-DDDD-DDDD' });

    const { token, deviceId } = await loginAs(a);

    // Attempt to pass account B's ID in the patch body
    const res = await request(app)
      .patch('/api/v1/account')
      .set('X-Device-ID', deviceId)
      .set('Authorization', `Bearer ${token}`)
      .send({ accountId: b._id.toString(), businessName: 'Hijacked' });

    expect(res.status).toBe(200);
    // Account A's name was updated (accountId from body was ignored)
    const updated = res.body.data;
    // B should be unchanged
    const Account = require('../../server/models/Account');
    const bFresh = await Account.findById(b._id);
    expect(bFresh.businessName).not.toBe('Hijacked');
  });
});

// ── Authentication ────────────────────────────────────────────────────────────
describe('Authentication guards', () => {
  test('protected route without token returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', uuidv4());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  test('malformed JWT returns 401 TOKEN_INVALID', async () => {
    const res = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', uuidv4())
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  test('tampered JWT returns 401', async () => {
    const { account } = await createTestAccount();
    const { token, deviceId } = await loginAs(account);
    const tampered = token.slice(0, -5) + 'XXXXX';

    const res = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', deviceId)
      .set('Authorization', `Bearer ${tampered}`);
    expect(res.status).toBe(401);
  });

  test('all protected routes require X-Device-ID', async () => {
    const { account } = await createTestAccount();
    const { token } = await loginAs(account);

    const routes = [
      ['get', '/api/v1/account'],
      ['get', '/api/v1/devices'],
      ['get', '/api/v1/settings'],
      ['get', '/api/v1/audit'],
    ];

    for (const [method, path] of routes) {
      const res = await request(app)
        [method](path)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_DEVICE_ID');
    }
  });
});

// ── Security — injection and input sanitization ───────────────────────────────
describe('Security — injection and malformed input', () => {
  test('MongoDB operator in login body is sanitized', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', uuidv4())
      .send({
        accountCode: 'AAAA-AAAA-AAAA',
        username: { $gt: '' },       // NoSQL injection attempt
        password: 'anypassword123',
      });
    // Either 400 (validation) or 401 (credentials) — never 200
    expect([400, 401]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  test('oversized body is rejected', async () => {
    const huge = 'x'.repeat(11 * 1024); // 11 KB > 10 KB limit
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', uuidv4())
      .set('Content-Type', 'application/json')
      .send(`{"accountCode":"AAAA-AAAA-AAAA","username":"admin","password":"${huge}"}`);
    expect(res.status).toBe(413);
  });

  test('error responses never expose stack traces', async () => {
    const res = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', uuidv4());

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at Object\./);
    expect(body).not.toMatch(/node_modules/);
    expect(body).not.toMatch(/Error:/);
  });

  test('error responses include requestId for tracing', async () => {
    const res = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', uuidv4());
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  test('passwordHash is never returned in any response', async () => {
    const { account } = await createTestAccount();
    const { token, deviceId } = await loginAs(account);

    const res = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', deviceId)
      .set('Authorization', `Bearer ${token}`);

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/passwordHash/);
    expect(body).not.toMatch(/\$2b\$/);  // bcrypt hash prefix
  });
});

// ── Health endpoint ───────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns 200 with status ok when DB is connected', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(typeof res.body.uptime).toBe('number');
  });
});
