import test from 'node:test';
import assert from 'node:assert/strict';
import { cache } from '../utils/cache';

test('zero TTL never reads or stores completed results, even within the same millisecond', async (t) => {
  cache.clear();
  t.after(() => cache.clear());
  t.mock.method(Date, 'now', () => 1000);
  cache.set('zero-ttl', 'stale', 10000);
  let reads = 0;
  const fetcher = async () => ++reads;
  assert.equal(await cache.getOrSet('zero-ttl', 0, fetcher), 1);
  assert.equal(await cache.getOrSet('zero-ttl', 0, fetcher), 2);
  assert.equal(cache.get('zero-ttl'), 'stale');
});

test('positive TTL still reuses completed results', async (t) => {
  cache.clear();
  t.after(() => cache.clear());
  let reads = 0;
  const fetcher = async () => ++reads;
  assert.equal(await cache.getOrSet('cached', 1000, fetcher), 1);
  assert.equal(await cache.getOrSet('cached', 1000, fetcher), 1);
});
