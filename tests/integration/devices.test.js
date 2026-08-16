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

async function loginAs(account, deviceId) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Device-ID', deviceId)
    .send({ accountCode: account.accountCode, username: 'testadmin', password: TEST_PASSWORD });
  return res;
}

// ── Device registration ───────────────────────────────────────────────────────
describe('Device registration and limit enforcement', () => {
  test('first, second, third device all register successfully', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });

    for (let i = 1; i <= 3; i++) {
      const res = await loginAs(account, uuidv4());
      expect(res.status).toBe(200);
    }
  });

  test('fourth device is rejected with 403 DEVICE_LIMIT_REACHED', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });

    // Register 3 devices
    await loginAs(account, uuidv4());
    await loginAs(account, uuidv4());
    await loginAs(account, uuidv4());

    // Fourth should fail
    const res = await loginAs(account, uuidv4());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DEVICE_LIMIT_REACHED');
    expect(res.body.data.activeDevices).toHaveLength(3);
    expect(res.body.data.limit).toBe(3);
  });

  test('returning device (same UUID) does not count as new and succeeds even at limit', async () => {
    const { account } = await createTestAccount({ deviceLimit: 3 });
    const returningDevice = uuidv4();

    // Fill to limit using the returning device as one of the 3
    await loginAs(account, returningDevice);
    await loginAs(account, uuidv4());
    await loginAs(account, uuidv4());

    // Same UUID again — should succeed (returning device, no new slot needed)
    const res = await loginAs(account, returningDevice);
    expect(res.status).toBe(200);
  });

  test('ATOMIC: two simultaneous new-device logins at limit=2 — only one succeeds', async () => {
    const { account } = await createTestAccount({ deviceLimit: 2 });

    // Fill one slot
    await loginAs(account, uuidv4());

    // Two concurrent login attempts from different new devices (one slot remaining)
    const [r1, r2] = await Promise.all([
      loginAs(account, uuidv4()),
      loginAs(account, uuidv4()),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // One should succeed (200), one should fail (403)
    expect(statuses).toEqual([200, 403]);

    const failedRes = r1.status === 403 ? r1 : r2;
    expect(failedRes.body.error.code).toBe('DEVICE_LIMIT_REACHED');
  });
});

// ── Device revocation ─────────────────────────────────────────────────────────
describe('Device revocation', () => {
  test('revoke a device and session is invalidated', async () => {
    const { account } = await createTestAccount();
    const device1 = uuidv4();
    const device2 = uuidv4();

    // Login from two devices
    const r1 = await loginAs(account, device1);
    const r2 = await loginAs(account, device2);
    const token1 = r1.body.data.accessToken;
    const token2 = r2.body.data.accessToken;

    // Get device list from device 1
    const devList = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', device1)
      .set('Authorization', `Bearer ${token1}`);

    const deviceToRevoke = devList.body.data.find((d) => !d.isCurrent);
    expect(deviceToRevoke).toBeDefined();

    // Revoke device 2 from device 1
    const revokeRes = await request(app)
      .delete(`/api/v1/devices/${deviceToRevoke._id}`)
      .set('X-Device-ID', device1)
      .set('Authorization', `Bearer ${token1}`);

    expect(revokeRes.status).toBe(200);

    // Device 2's token should now be rejected
    const protectedRes = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', device2)
      .set('Authorization', `Bearer ${token2}`);

    expect(protectedRes.status).toBe(401);
  });

  test('cannot revoke current device', async () => {
    const { account } = await createTestAccount();
    const device1 = uuidv4();
    const r = await loginAs(account, device1);
    const token = r.body.data.accessToken;

    const devList = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', device1)
      .set('Authorization', `Bearer ${token}`);

    const currentDevice = devList.body.data.find((d) => d.isCurrent);

    const revokeRes = await request(app)
      .delete(`/api/v1/devices/${currentDevice._id}`)
      .set('X-Device-ID', device1)
      .set('Authorization', `Bearer ${token}`);

    expect(revokeRes.status).toBe(400);
  });

  test('logout-others revokes all other sessions but keeps current valid', async () => {
    const { account } = await createTestAccount();
    const [d1, d2, d3] = [uuidv4(), uuidv4(), uuidv4()];

    const r1 = await loginAs(account, d1);
    const r2 = await loginAs(account, d2);
    const r3 = await loginAs(account, d3);
    const t1 = r1.body.data.accessToken;
    const t2 = r2.body.data.accessToken;
    const t3 = r3.body.data.accessToken;

    // Logout others from device 1
    await request(app)
      .post('/api/v1/devices/logout-others')
      .set('X-Device-ID', d1)
      .set('Authorization', `Bearer ${t1}`);

    // Device 1 still works
    const still = await request(app)
      .get('/api/v1/account')
      .set('X-Device-ID', d1)
      .set('Authorization', `Bearer ${t1}`);
    expect(still.status).toBe(200);

    // Devices 2 and 3 are revoked
    const [res2, res3] = await Promise.all([
      request(app).get('/api/v1/account').set('X-Device-ID', d2).set('Authorization', `Bearer ${t2}`),
      request(app).get('/api/v1/account').set('X-Device-ID', d3).set('Authorization', `Bearer ${t3}`),
    ]);
    expect(res2.status).toBe(401);
    expect(res3.status).toBe(401);
  });

  test('invalid device ID returns 400', async () => {
    const { account } = await createTestAccount();
    const r = await loginAs(account, uuidv4());

    const res = await request(app)
      .get('/api/v1/devices')
      .set('X-Device-ID', 'not-a-uuid')
      .set('Authorization', `Bearer ${r.body.data.accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_DEVICE_ID');
  });
});
