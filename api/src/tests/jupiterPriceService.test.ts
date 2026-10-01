import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTokenPrices } from '../services/jupiterPriceService';

test('prices use deduplicated batches of at most 50 and subsequent reads hit the local cache', async (t) => {
  const requested: string[][] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const target = new URL(url);
    assert.equal(target.pathname, '/price/v3');
    assert.equal(target.origin, new URL(process.env.JUPITER_API_URL || 'https://jup-proxy-production-eff9.up.railway.app').origin);
    const ids = target.searchParams.get('ids')!.split(',');
    requested.push(ids);
    return new Response(JSON.stringify(Object.fromEntries(ids.map(id => [id, { usdPrice: 2, decimals: 6 }]))));
  });
  const mints = Array.from({ length: 101 }, (_, i) => `batch-mint-${i}`);
  const result = await fetchTokenPrices([...mints, mints[0]]);
  assert.equal(result.size, 101);
  assert.deepEqual(requested.map(ids => ids.length), [50, 50, 1]);
  assert.deepEqual(await fetchTokenPrices(mints), result);
  assert.equal(requested.length, 3);
});

test('a failed batch does not discard prices from successful batches', async (t) => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    const ids = new URL(url).searchParams.get('ids')!.split(',');
    if (ids.length === 1) return new Response('{}', { status: 503 });
    return new Response(JSON.stringify(Object.fromEntries(ids.map(id => [id, { usdPrice: 3, decimals: 6 }]))));
  });
  const mints = Array.from({ length: 51 }, (_, i) => `failure-mint-${i}`);
  const result = await fetchTokenPrices(mints);
  assert.equal(result.size, 50);
  assert.equal(result.has(mints[50]), false);
});

test('invalid upstream prices and network failures remain unavailable', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    'invalid-price': { usdPrice: '2', decimals: 6 },
    'negative-price': { usdPrice: -2, decimals: 6 },
  })));
  assert.equal((await fetchTokenPrices(['invalid-price', 'negative-price'])).size, 0);
  t.mock.method(console, 'error', () => {});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  assert.equal((await fetchTokenPrices(['offline-mint'])).size, 0);
});
