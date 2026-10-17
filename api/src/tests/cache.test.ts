import test from 'node:test';
import assert from 'node:assert/strict';
import { SimpleCache } from '../utils/cache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const policy = { ttlMs: 15_000, staleWhileRevalidateMs: 45_000 };

for (const outcome of ['reject', 'null'] as const) {
  test(`unbounded stale data survives cleanup and ${outcome} refreshes until a refresh succeeds`, { timeout: 2000 }, async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    t.mock.method(console, 'warn', () => {});
    const cache = new SimpleCache();
    const unboundedPolicy = { ttlMs: 15_000, staleWhileRevalidateMs: Number.POSITIVE_INFINITY };
    cache.set('pool:a', 'old', unboundedPolicy);
    const failingFetcher = t.mock.fn(async () => {
      if (outcome === 'reject') throw new Error('upstream unavailable');
      return null;
    });

    now += 200_000;
    cache.cleanup();
    assert.equal(await cache.getOrSet('pool:a', unboundedPolicy, failingFetcher), 'old');
    await flush();
    now += 4999;
    assert.equal(await cache.getOrSet('pool:a', unboundedPolicy, failingFetcher), 'old');
    assert.equal(failingFetcher.mock.callCount(), 1);

    now += 24 * 60 * 60 * 1000;
    cache.cleanup();
    assert.equal(await cache.getOrSet('pool:a', unboundedPolicy, failingFetcher), 'old');
    await flush();
    assert.equal(failingFetcher.mock.callCount(), 2);
    assert.equal(cache.get('pool:a'), null); // Failure must not mark the old value fresh.

    now += 5000;
    const pending = deferred<string>();
    const recover = t.mock.fn(() => pending.promise);
    assert.equal(await cache.getOrSet('pool:a', unboundedPolicy, recover), 'old');
    assert.equal(await cache.getOrSet('pool:a', unboundedPolicy, recover), 'old');
    assert.equal(recover.mock.callCount(), 1);
    pending.resolve('recovered');
    await flush();
    assert.equal(cache.get('pool:a'), 'recovered');
  });
}

test('cold requests share one fetch, then fresh reads hit the cache', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const cache = new SimpleCache();
  const pending = deferred<string>();
  const fetcher = t.mock.fn(() => pending.promise);
  const first = cache.getOrSetWithMeta('pool:a', policy, fetcher);
  const second = cache.getOrSetWithMeta('pool:a', policy, fetcher);
  await flush();
  assert.equal(fetcher.mock.callCount(), 1);
  pending.resolve('new');
  assert.deepEqual(await first, { data: 'new', cacheStatus: 'miss' });
  assert.deepEqual(await second, { data: 'new', cacheStatus: 'coalesced' });
  assert.deepEqual(await cache.getOrSetWithMeta('pool:a', policy, fetcher), { data: 'new', cacheStatus: 'hit' });
});

test('stale requests return immediately, while strict and too-old reads await the same refresh', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const cache = new SimpleCache();
  cache.set('pool:a', 'old', policy);
  now += policy.ttlMs;
  const pending = deferred<string>();
  const fetcher = t.mock.fn(() => pending.promise);

  assert.deepEqual(await cache.getOrSetWithMeta('pool:a', policy, fetcher), { data: 'old', cacheStatus: 'stale' });
  assert.equal(await cache.getOrSet('pool:a', policy, fetcher), 'old');
  let strictFinished = false;
  const strict = cache.getOrSet('pool:a', { ...policy, allowStale: false }, fetcher)
    .then((value) => { strictFinished = true; return value; });
  now += policy.staleWhileRevalidateMs;
  let expiredFinished = false;
  const expired = cache.getOrSet('pool:a', policy, fetcher)
    .then((value) => { expiredFinished = true; return value; });
  await flush();
  assert.equal(strictFinished, false);
  assert.equal(expiredFinished, false);
  assert.equal(fetcher.mock.callCount(), 1);

  pending.resolve('new');
  assert.equal(await strict, 'new');
  assert.equal(await expired, 'new');
  assert.equal(await cache.getOrSet('pool:a', policy, fetcher), 'new');
  assert.deepEqual(cache.snapshotStats().pool, { hits: 1, misses: 0, stale: 2, coalesced: 2 });
});

test('numeric TTLs keep blocking refresh behavior, including at the expiry boundary', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const cache = new SimpleCache();
  cache.set('activity:a', 'old', 100);
  now += 100;
  const pending = deferred<string>();
  let finished = false;
  const request = cache.getOrSet('activity:a', 100, () => pending.promise)
    .then((value) => { finished = true; return value; });
  await flush();
  assert.equal(finished, false);
  pending.resolve('new');
  assert.equal(await request, 'new');
});

test('TTL zero only coalesces in-flight reads, even within the same millisecond', async (t) => {
  t.mock.method(Date, 'now', () => 1000);
  const cache = new SimpleCache();
  const pending = deferred<string>();
  const fetcher = t.mock.fn(() => pending.promise);
  const first = cache.getOrSet('positions:wallet', 0, fetcher);
  const second = cache.getOrSet('positions:wallet', 0, fetcher);
  await flush();
  assert.equal(fetcher.mock.callCount(), 1);
  pending.resolve('position before transaction');
  await Promise.all([first, second]);
  assert.equal(cache.get('positions:wallet'), null);
  assert.equal(await cache.getOrSet('positions:wallet', 0, async () => 'position after transaction'), 'position after transaction');
  assert.equal(cache.get('positions:wallet'), null);
});

for (const outcome of ['reject', 'null'] as const) {
  test(`a ${outcome} refresh retains stale data, backs off, and never extends its lifetime`, async (t) => {
    let now = 1000;
    t.mock.method(Date, 'now', () => now);
    t.mock.method(console, 'warn', () => {});
    const cache = new SimpleCache();
    cache.set('pool:a', 'old', policy);
    now += policy.ttlMs;
    const fetcher = t.mock.fn(async () => {
      if (outcome === 'reject') throw new Error('upstream unavailable');
      return null;
    });
    assert.equal(await cache.getOrSet('pool:a', policy, fetcher), 'old');
    await flush();
    now += 4999;
    assert.equal(await cache.getOrSet('pool:a', policy, fetcher), 'old');
    assert.equal(fetcher.mock.callCount(), 1);
    now++;
    assert.equal(await cache.getOrSet('pool:a', policy, fetcher), 'old');
    await flush();
    assert.equal(fetcher.mock.callCount(), 2);

    now = 1000 + policy.ttlMs + policy.staleWhileRevalidateMs;
    const request = cache.getOrSet('pool:a', policy, fetcher);
    if (outcome === 'reject') {
      await assert.rejects(request, /upstream unavailable/);
    } else {
      assert.equal(await request, null);
    }
    assert.equal(cache.get('pool:a'), null);
    assert.equal(await cache.getOrSet('pool:a', policy, async () => 'recovered'), 'recovered');
  });
}

test('cleanup retains stale entries only until their maximum age', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const cache = new SimpleCache();
  cache.set('pool:a', 'old', policy);
  now += policy.ttlMs;
  cache.cleanup();
  assert.equal(cache.get('pool:a'), null); // Fresh-only reads must not discard the stale value.
  const pending = deferred<string>();
  assert.equal(await cache.getOrSet('pool:a', policy, () => pending.promise), 'old');
  now += policy.staleWhileRevalidateMs;
  cache.cleanup();
  // Only the pending request is left, and prefix invalidation must detach it.
  assert.equal(cache.deleteByPrefix('pool:'), 1);
  pending.resolve('obsolete');
  await flush();
  assert.equal(cache.get('pool:a'), null);
});

const invalidators = {
  delete: (cache: SimpleCache) => cache.delete('pool:a'),
  prefix: (cache: SimpleCache) => cache.deleteByPrefix('pool:'),
  clear: (cache: SimpleCache) => cache.clear(),
};

for (const [name, invalidate] of Object.entries(invalidators)) {
  for (const background of [false, true]) {
    for (const oldFinishesFirst of [false, true]) {
      test(`${name} invalidation detaches ${background ? 'background' : 'cold'} reads; old finishes ${oldFinishesFirst ? 'first' : 'last'}`, async (t) => {
        let now = 1000;
        t.mock.method(Date, 'now', () => now);
        const cache = new SimpleCache();
        if (background) {
          cache.set('pool:a', 'cached', policy);
          now += policy.ttlMs;
        }
        const oldRead = deferred<string>();
        const oldRequest = cache.getOrSet('pool:a', policy, () => oldRead.promise);
        await flush();
        invalidate(cache);

        const newRead = deferred<string>();
        const fetchNew = t.mock.fn(() => newRead.promise);
        const newRequest = cache.getOrSet('pool:a', policy, fetchNew);
        await flush();
        assert.equal(fetchNew.mock.callCount(), 1);

        if (oldFinishesFirst) {
          oldRead.resolve('obsolete');
          await flush();
          assert.equal(cache.get('pool:a'), null);
          const third = cache.getOrSetWithMeta('pool:a', policy, fetchNew);
          newRead.resolve('current');
          assert.deepEqual(await third, { data: 'current', cacheStatus: 'coalesced' });
          assert.equal(fetchNew.mock.callCount(), 1);
        } else {
          newRead.resolve('current');
          await newRequest;
          oldRead.resolve('obsolete');
        }
        await oldRequest;
        await newRequest;
        await flush();
        assert.equal(cache.get('pool:a'), 'current');
      });
    }
  }
}

test('prefix invalidation leaves unrelated pending reads intact', async () => {
  const cache = new SimpleCache();
  const pending = deferred<string>();
  const request = cache.getOrSet('stats:volume', 1000, () => pending.promise);
  assert.equal(cache.deleteByPrefix('pools:'), 0);
  pending.resolve('stats');
  await request;
  assert.equal(cache.get('stats:volume'), 'stats');
});
