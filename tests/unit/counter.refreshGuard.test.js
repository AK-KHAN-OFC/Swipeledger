'use strict';

const { connectTestDB, disconnectTestDB, clearCollections } = require('../helpers/db');

// ── Counter ───────────────────────────────────────────────────────────────────
describe('Counter utility — atomic sequential IDs', () => {
  beforeAll(() => connectTestDB(), 60000);
  afterAll(() => disconnectTestDB(), 30000);
  afterEach(() => clearCollections());

  test('getNextSequence starts at 1', async () => {
    const { getNextSequence } = require('../../server/utils/counter');
    const seq = await getNextSequence('testaccount1', 'customer');
    expect(seq).toBe(1);
  });

  test('getNextSequence increments monotonically', async () => {
    const { getNextSequence } = require('../../server/utils/counter');
    const s1 = await getNextSequence('testaccount2', 'transaction');
    const s2 = await getNextSequence('testaccount2', 'transaction');
    const s3 = await getNextSequence('testaccount2', 'transaction');
    expect([s1, s2, s3]).toEqual([1, 2, 3]);
  });

  test('different types have independent sequences', async () => {
    const { getNextSequence } = require('../../server/utils/counter');
    const c1 = await getNextSequence('testaccount3', 'customer');
    const t1 = await getNextSequence('testaccount3', 'transaction');
    expect(c1).toBe(1);
    expect(t1).toBe(1); // independent counter
  });

  test('different accounts have independent sequences', async () => {
    const { getNextSequence } = require('../../server/utils/counter');
    const a = await getNextSequence('account-A', 'customer');
    const b = await getNextSequence('account-B', 'customer');
    expect(a).toBe(1);
    expect(b).toBe(1); // independent
  });

  test('concurrent calls produce unique non-duplicated values', async () => {
    const { getNextSequence } = require('../../server/utils/counter');
    const CONCURRENT = 20;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT }, () =>
        getNextSequence('concurrent-account', 'customer'),
      ),
    );
    const unique = new Set(results);
    // All values must be unique (no race condition duplicates)
    expect(unique.size).toBe(CONCURRENT);
    // Values must be in range 1..CONCURRENT
    const sorted = [...unique].sort((a, b) => a - b);
    expect(sorted[0]).toBe(1);
    expect(sorted[CONCURRENT - 1]).toBe(CONCURRENT);
  });

  test('nextCustomerId formats correctly', async () => {
    const { nextCustomerId } = require('../../server/utils/counter');
    const id = await nextCustomerId('someaccountid');
    expect(id).toMatch(/^CUST-\d{4}$/);
    expect(id).toBe('CUST-0001');
  });

  test('nextTransactionId formats correctly', async () => {
    const { nextTransactionId } = require('../../server/utils/counter');
    const id = await nextTransactionId('someaccountid');
    expect(id).toMatch(/^TXN-\d{6}$/);
    expect(id).toBe('TXN-000001');
  });
});

// ── Refresh guard singleton ───────────────────────────────────────────────────
// Tests the core promise-singleton pattern in isolation,
// without requiring the browser axios instance.
describe('Refresh guard — singleton promise pattern', () => {
  function createRefreshGuard() {
    let refreshPromise = null;
    return {
      executeWithGuard(refreshFn) {
        if (!refreshPromise) {
          refreshPromise = refreshFn().finally(() => {
            refreshPromise = null;
          });
        }
        return refreshPromise;
      },
    };
  }

  test('calls refresh function exactly once for N concurrent callers', async () => {
    const guard = createRefreshGuard();
    let callCount = 0;

    const refreshFn = () =>
      new Promise((resolve) =>
        setTimeout(() => {
          callCount++;
          resolve('new-token');
        }, 20),
      );

    const results = await Promise.all([
      guard.executeWithGuard(refreshFn),
      guard.executeWithGuard(refreshFn),
      guard.executeWithGuard(refreshFn),
      guard.executeWithGuard(refreshFn),
    ]);

    expect(callCount).toBe(1);
    expect(results).toEqual(['new-token', 'new-token', 'new-token', 'new-token']);
  });

  test('resets the guard after completion — allows next refresh', async () => {
    const guard = createRefreshGuard();
    let calls = 0;
    const refreshFn = () => Promise.resolve(++calls);

    const r1 = await guard.executeWithGuard(refreshFn);
    const r2 = await guard.executeWithGuard(refreshFn);

    expect(calls).toBe(2);
    expect(r1).toBe(1);
    expect(r2).toBe(2);
  });

  test('propagates failure to all concurrent callers', async () => {
    const guard = createRefreshGuard();
    const boom = new Error('Refresh failed');
    const refreshFn = () => Promise.reject(boom);

    const settled = await Promise.allSettled([
      guard.executeWithGuard(refreshFn),
      guard.executeWithGuard(refreshFn),
      guard.executeWithGuard(refreshFn),
    ]);

    expect(settled.every((r) => r.status === 'rejected')).toBe(true);
  });

  test('guard resets after failure — next call retries', async () => {
    const guard = createRefreshGuard();
    let attempt = 0;

    const refreshFn = () => {
      attempt++;
      return attempt === 1 ? Promise.reject(new Error('fail')) : Promise.resolve('ok');
    };

    await guard.executeWithGuard(refreshFn).catch(() => {});
    const result = await guard.executeWithGuard(refreshFn);
    expect(result).toBe('ok');
    expect(attempt).toBe(2);
  });
});
