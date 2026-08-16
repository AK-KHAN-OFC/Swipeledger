'use strict';

/**
 * Security test suite — Phase 1
 *
 * Cross-cutting security concerns are tested here.
 * Note: many security assertions (NoSQL injection, passwordHash exposure,
 * stack trace suppression, request ID tracing, unauthorized access) are
 * already covered in tests/integration/isolation.test.js under the
 * "Security — injection and malformed input" describe block.
 *
 * This file collects security tests that are distinct from integration
 * concerns, and documents Phase 6 (Security Hardening) TODOs.
 */

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

// ── Security headers ──────────────────────────────────────────────────────────
describe('Security headers', () => {
  test('X-Frame-Options or CSP frame-ancestors prevents clickjacking', async () => {
    const res = await request(app).get('/health');
    // Helmet sets either X-Frame-Options or CSP frame-ancestors
    const frameOptions = res.headers['x-frame-options'];
    const csp = res.headers['content-security-policy'] || '';
    const protected_ = frameOptions === 'DENY' || csp.includes("frame-ancestors 'none'");
    expect(protected_).toBe(true);
  });

  test('X-Content-Type-Options is set to nosniff', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('X-Request-ID correlation header is returned on every response', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  test('provided X-Request-ID is echoed back', async () => {
    const clientId = uuidv4();
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', clientId);
    expect(res.headers['x-request-id']).toBe(clientId);
  });
});

// ── Authentication boundary ───────────────────────────────────────────────────
describe('Authentication boundary', () => {
  test('every protected route rejects requests without Authorization header', async () => {
    const deviceId = uuidv4();
    const routes = [
      ['get',    '/api/v1/account'],
      ['patch',  '/api/v1/account'],
      ['get',    '/api/v1/devices'],
      ['get',    '/api/v1/settings'],
      ['patch',  '/api/v1/settings'],
      ['get',    '/api/v1/audit'],
      ['post',   '/api/v1/auth/logout'],
      ['post',   '/api/v1/auth/logout-all'],
      ['post',   '/api/v1/auth/change-password'],
    ];

    for (const [method, path] of routes) {
      const res = await request(app)
        [method](path)
        .set('X-Device-ID', deviceId);
      expect(res.status).toBe(401);
      expect(['TOKEN_INVALID', 'TOKEN_EXPIRED']).toContain(res.body.error?.code);
    }
  });

  test('Bearer token with wrong signature is rejected', async () => {
    const jwt = require('jsonwebtoken');
    const fakeToken = jwt.sign(
      { sub: 'fakeid', did: 'fakeid', sid: 'fakeid', pca: 0 },
      'completely-wrong-secret-not-matching-server',
    );
    const res = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', uuidv4())
      .set('Authorization', `Bearer ${fakeToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });

  test('responses never expose stack traces', async () => {
    // Trigger a 404 and inspect the error body
    const res = await request(app)
      .get('/api/v1/nonexistent-route-xyz')
      .set('X-Device-ID', uuidv4());
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at Object\./);
    expect(body).not.toMatch(/node_modules/);
    expect(body).not.toMatch(/\.js:\d+:\d+/); // file:line:col stack frame pattern
  });
});

// ── Input sanitization ────────────────────────────────────────────────────────
describe('Input sanitization', () => {
  test('MongoDB $ operator in login body does not cause 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', uuidv4())
      .send({ accountCode: 'AAAA-AAAA-AAAA', username: { $gt: '' }, password: 'anypassword1' });
    expect(res.status).not.toBe(200);
    expect([400, 401]).toContain(res.status);
  });

  test('oversized request body is rejected with 413', async () => {
    const huge = 'x'.repeat(11 * 1024);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', uuidv4())
      .set('Content-Type', 'application/json')
      .send(`{"accountCode":"AAAA-AAAA-AAAA","username":"admin","password":"${huge}"}`);
    expect(res.status).toBe(413);
  });
});

// ── Sensitive data exposure ───────────────────────────────────────────────────
describe('Sensitive data exposure', () => {
  test('passwordHash is never returned in account response', async () => {
    const { account } = await createTestAccount();
    const deviceId = uuidv4();
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', deviceId)
      .send({ accountCode: account.accountCode, username: account.username, password: TEST_PASSWORD });

    const token = loginRes.body.data?.accessToken;
    const accRes = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', deviceId)
      .set('Authorization', `Bearer ${token}`);

    const body = JSON.stringify(accRes.body);
    expect(body).not.toMatch(/passwordHash/);
    expect(body).not.toMatch(/\$2b\$/); // bcrypt hash prefix
  });
});

/*
 * ── Phase 6 TODO ─────────────────────────────────────────────────────────────
 * The following security tests are deferred to Phase 6 (Security Hardening):
 *
 * - Brute-force account lockout after sustained failures across sessions
 * - Refresh token reuse detection (session invalidation on reuse of rotated token)
 * - Rate limit bypass via X-Forwarded-For header spoofing
 * - CORS preflight enforcement for disallowed origins
 * - Content-Type enforcement on mutation endpoints
 */
