'use strict';

/**
 * Regression tests for confirmed findings F-1, F-2, F-3.
 *
 * Run with: npm test -- --testPathPattern=findings
 *   or:     npm test  (included in the full suite via jest.config.js testMatch)
 *
 * These tests require mongodb-memory-server (replica set, for transactions)
 * and supertest. They follow the same patterns as the existing integration tests.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAs(account, deviceId, extra = {}) {
  return request(app)
    .post('/api/v1/auth/login')
    .set('X-Device-ID', deviceId)
    .send({
      accountCode: account.accountCode,
      username:    account.username,
      password:    TEST_PASSWORD,
      ...extra,
    });
}

async function fillDeviceLimit(account, limit = 3) {
  const devices = [];
  for (let i = 0; i < limit; i++) {
    const id = uuidv4();
    await loginAs(account, id);
    devices.push(id);
  }
  return devices;
}

// ─────────────────────────────────────────────────────────────────────────────
// F-1 — Device revoke via login-flow (revokeDeviceId)
// ─────────────────────────────────────────────────────────────────────────────

describe('F-1: device revoke via login flow (revokeDeviceId)', () => {
  /**
   * Core path: device-limit hit → supply revokeDeviceId in next login →
   * server revokes old device and registers new one → login succeeds.
   */
  test('revokeDeviceId frees a slot when device limit is reached', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });
    const devices = await fillDeviceLimit(account, 3);

    // 4th device is rejected — capture the active device list
    const newDevice = uuidv4();
    const limitRes = await loginAs(account, newDevice);
    expect(limitRes.status).toBe(403);
    expect(limitRes.body.error.code).toBe('DEVICE_LIMIT_REACHED');

    const activeDevices = limitRes.body.data.activeDevices;
    expect(activeDevices).toHaveLength(3);

    // Pick one device to revoke
    const toRevoke = activeDevices[0];

    // Re-submit login WITH revokeDeviceId → should succeed
    const loginRes = await loginAs(account, newDevice, { revokeDeviceId: toRevoke._id });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeTruthy();
  });

  /**
   * Security: revokeDeviceId from a DIFFERENT account must be silently ignored.
   * The login should still fail with DEVICE_LIMIT_REACHED (not 200 and not 500).
   */
  test('revokeDeviceId belonging to another account is silently ignored', async () => {
    const { account: accountA } = await createTestAccount({ username: 'userone' });
    const { account: accountB } = await createTestAccount({
      username: 'usertwo',
      accountCode: 'BBBB-BBBB-BBBB',
    });

    // Fill account A's device limit
    await fillDeviceLimit(accountA, 3);

    // Login as account B on one device (creates a device record owned by B)
    const deviceBId = uuidv4();
    const loginB = await loginAs(accountB, deviceBId);
    expect(loginB.status).toBe(200);

    // Get account B's device _id
    const devListB = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', deviceBId)
      .set('Authorization', `Bearer ${loginB.body.data.accessToken}`);
    const deviceBRecord = devListB.body.data[0];
    expect(deviceBRecord).toBeDefined();

    // Try to login as account A, supplying account B's device ID to revoke
    const newDeviceA = uuidv4();
    const attackRes = await loginAs(accountA, newDeviceA, {
      revokeDeviceId: deviceBRecord._id, // belongs to account B
    });

    // Must still be rejected (device limit not freed — wrong account's device)
    expect(attackRes.status).toBe(403);
    expect(attackRes.body.error.code).toBe('DEVICE_LIMIT_REACHED');

    // Confirm account B's device is still active
    const verifyB = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', deviceBId)
      .set('Authorization', `Bearer ${loginB.body.data.accessToken}`);
    expect(verifyB.status).toBe(200);
  });

  /**
   * Security: revokeDeviceId with invalid credentials must fail at credential
   * check — the revoke must NOT happen before credentials are verified.
   */
  test('revokeDeviceId with wrong password does not revoke device', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });
    const [d1] = await fillDeviceLimit(account, 1);

    // Get the device _id
    const loginRes = await loginAs(account, d1);
    const devListRes = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', d1)
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    const deviceId = devListRes.body.data[0]._id;

    // Attempt login with WRONG password + revokeDeviceId
    const badRes = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Device-ID', uuidv4())
      .send({
        accountCode: account.accountCode,
        username:    account.username,
        password:    'wrongpassword!',
        revokeDeviceId: deviceId,
      });

    expect(badRes.status).toBe(401);
    expect(badRes.body.error.code).toBe('INVALID_CREDENTIALS');

    // Device must still be active
    const verifyDevice = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', d1)
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expect(verifyDevice.status).toBe(200);
  });

  /**
   * Revoking an already-inactive device ID is silently ignored.
   * The login should still return DEVICE_LIMIT_REACHED (no free slot).
   */
  test('revokeDeviceId for already-inactive device is silently ignored', async () => {
    const { account } = await createTestAccount({ deviceLimit: 2 });

    const d1 = uuidv4();
    const d2 = uuidv4();
    const r1 = await loginAs(account, d1);
    await loginAs(account, d2);

    // Revoke d1 via the authenticated Devices API
    const devList = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', d1)
      .set('Authorization', `Bearer ${r1.body.data.accessToken}`);
    const d2Record = devList.body.data.find((d) => !d.isCurrent);

    await request(app)
      .delete(`/api/v1/devices/${d2Record._id}`)
      .set('X-Device-ID', d1)
      .set('Authorization', `Bearer ${r1.body.data.accessToken}`);

    // Now the limit is no longer hit — but d2Record._id is already inactive.
    // Try a new 3rd device with the already-inactive revokeDeviceId (d2):
    const d3 = uuidv4();
    const res = await loginAs(account, d3, { revokeDeviceId: d2Record._id });
    // d1 is active, d2 is already revoked → limit is 1/2 → new device registers fine
    expect(res.status).toBe(200);
  });

  /**
   * revokeDeviceId that is a valid 24-hex string but not a known ObjectId
   * should be silently ignored (Device.findOne returns null).
   */
  test('revokeDeviceId for non-existent ObjectId is silently ignored', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });
    await fillDeviceLimit(account, 3);

    const fakeObjectId = '000000000000000000000001'; // valid 24-hex, doesn't exist
    const res = await loginAs(account, uuidv4(), { revokeDeviceId: fakeObjectId });

    // Slot not freed (fake device wasn't found) → still at limit
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DEVICE_LIMIT_REACHED');
  });

  /**
   * revokeDeviceId with invalid format (not 24 hex chars) is rejected by Zod.
   */
  test('revokeDeviceId with invalid format returns 400 VALIDATION_ERROR', async () => {
    const { account } = await createTestAccount();
    const res = await loginAs(account, uuidv4(), { revokeDeviceId: 'not-an-objectid' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  /**
   * Existing login without revokeDeviceId is unaffected.
   */
  test('normal login without revokeDeviceId still works', async () => {
    const { account } = await createTestAccount();
    const res = await loginAs(account, uuidv4());
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F-2 — Duplicate mobile number registration
// ─────────────────────────────────────────────────────────────────────────────

describe('F-2: duplicate mobile number registration', () => {
  const MOBILE = '+919876543210';

  /**
   * Registering with a mobile that is already used returns 409.
   */
  test('second account with same mobile number returns 409 DUPLICATE_MOBILE_NUMBER', async () => {
    // First registration — should succeed
    const r1 = await request(app)
      .post('/api/v1/auth/register')
      .send({ businessName: 'Shop One', mobileNumber: MOBILE });
    expect(r1.status).toBe(201);

    // Second registration with the same mobile — should return 409
    const r2 = await request(app)
      .post('/api/v1/auth/register')
      .send({ businessName: 'Shop Two', mobileNumber: MOBILE });
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe('DUPLICATE_MOBILE_NUMBER');
    expect(r2.body.success).toBe(false);
  });

  /**
   * Registration without a mobile number must still succeed.
   * null is excluded from the sparse unique index.
   */
  test('registration without mobile number is allowed', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ businessName: 'No-Phone Shop' });
    expect(res.status).toBe(201);
    expect(res.body.data.accountCode).toBeTruthy();
  });

  /**
   * Multiple accounts without mobile numbers must all be allowed.
   */
  test('multiple accounts with no mobile number are all allowed', async () => {
    const r1 = await request(app).post('/api/v1/auth/register').send({ businessName: 'Shop A' });
    const r2 = await request(app).post('/api/v1/auth/register').send({ businessName: 'Shop B' });
    const r3 = await request(app).post('/api/v1/auth/register').send({ businessName: 'Shop C' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r3.status).toBe(201);
  });

  /**
   * Two different mobile numbers can be registered independently.
   */
  test('two accounts with different mobile numbers both succeed', async () => {
    const r1 = await request(app).post('/api/v1/auth/register')
      .send({ businessName: 'Shop Alpha', mobileNumber: '+919000000001' });
    const r2 = await request(app).post('/api/v1/auth/register')
      .send({ businessName: 'Shop Beta',  mobileNumber: '+919000000002' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  /**
   * Concurrent duplicate mobile registrations — only one must succeed.
   * This tests that the unique index (not just the controller check) prevents
   * the race condition where two requests pass the pre-check simultaneously.
   */
  test('concurrent duplicate mobile registrations — exactly one succeeds', async () => {
    const payload = { businessName: 'Race Shop', mobileNumber: '+919111111111' };
    const [r1, r2, r3] = await Promise.all([
      request(app).post('/api/v1/auth/register').send(payload),
      request(app).post('/api/v1/auth/register').send(payload),
      request(app).post('/api/v1/auth/register').send(payload),
    ]);
    const results = [r1, r2, r3];
    const successes = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(2);
    conflicts.forEach((r) => {
      expect(r.body.error.code).toBe('DUPLICATE_MOBILE_NUMBER');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F-3 — Clear app data / device UUID reset + F-1 mitigation
// ─────────────────────────────────────────────────────────────────────────────

describe('F-3: device UUID reset (simulated Clear App Data) + F-1 mitigation', () => {
  /**
   * Simulates "Clear App Data": first UUID registers a device.
   * A second distinct UUID registers a separate device.
   * This confirms the backend correctly treats different UUIDs as different devices.
   */
  test('two distinct UUIDs create two separate device records', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });

    const uuid1 = uuidv4();
    const uuid2 = uuidv4(); // new UUID simulating Clear App Data

    const r1 = await loginAs(account, uuid1);
    const r2 = await loginAs(account, uuid2);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Both are separate authenticated sessions
    const devList = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', uuid1)
      .set('Authorization', `Bearer ${r1.body.data.accessToken}`);

    expect(devList.body.data).toHaveLength(2);
  });

  /**
   * After UUID reset, once the device limit is hit, the F-1 fix (revokeDeviceId
   * in the login body) allows the user to remove a stale device and log in.
   *
   * Simulated scenario:
   *   1. Login 3× with 3 different UUIDs (device limit filled).
   *   2. "Clear app data" → new UUID.
   *   3. Login with new UUID → DEVICE_LIMIT_REACHED.
   *   4. Supply one of the old device IDs as revokeDeviceId → login succeeds.
   */
  test('F-1 mitigation: revokeDeviceId clears a stale slot after UUID reset', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });

    // Step 1: fill 3 device slots
    await fillDeviceLimit(account, 3);

    // Step 2+3: new UUID → hit limit
    const newUuid = uuidv4();
    const limitRes = await loginAs(account, newUuid);
    expect(limitRes.status).toBe(403);
    expect(limitRes.body.error.code).toBe('DEVICE_LIMIT_REACHED');

    const activeDevices = limitRes.body.data.activeDevices;
    const staleDevice   = activeDevices[0]; // oldest slot to clear

    // Step 4: re-login with revokeDeviceId → should succeed
    const recoveryRes = await loginAs(account, newUuid, {
      revokeDeviceId: staleDevice._id,
    });
    expect(recoveryRes.status).toBe(200);
    expect(recoveryRes.body.data.accessToken).toBeTruthy();
  });

  /**
   * F-3 known limitation: this is documented, not fixed by code.
   * After Clear App Data, the old device records remain active in the DB.
   * The test below confirms the backend behaviour is consistent with this.
   */
  test('F-3 limitation documented: old device UUID remains in DB after clear', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });
    const originalUuid = uuidv4();

    // Login with original UUID
    const r1 = await loginAs(account, originalUuid);
    expect(r1.status).toBe(200);

    // Simulate Clear App Data → login with brand new UUID
    const newUuid = uuidv4();
    const r2 = await loginAs(account, newUuid);
    expect(r2.status).toBe(200); // device limit is 3, only 2 used

    // Both devices are now listed (old + new)
    const devList = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', newUuid)
      .set('Authorization', `Bearer ${r2.body.data.accessToken}`);

    expect(devList.body.data).toHaveLength(2);
    // This is the F-3 limitation: the old UUID still occupies a slot.
    // The user must use F-1 (revokeDeviceId) or the Devices settings page to clean up.
  });
});
