import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database';
import { PoolController } from '../controllers/poolController';
import * as helpers from '../controllers/helpers/controllerBase';
import * as pricing from '../services/jupiterPriceService';
import { cache } from '../utils/cache';

test('the pool endpoint caches USD totals and refreshes them after invalidation', async (t) => {
  cache.clear();
  t.after(() => cache.clear());
  t.mock.method(pool, 'query', async (sql: string) => ({ rows: sql.includes('pool_category_assignments') ? [] : [
    { id: 1, pair_address: 'pool-a', token0: 'a', token1: 'b' },
    { id: 2, pair_address: 'unavailable', token0: 'a', token1: 'b' },
  ] }));
  t.mock.method(helpers, 'initializePairStateService', async () => ({}));
  t.mock.method(helpers, 'fetchCachedPairState', async (_service: unknown, address: string) => {
    if (address === 'unavailable') throw new Error('state unavailable');
    return {
      token0: { address: 'a', symbol: 'A', name: 'A', decimals: 9 },
      token1: { address: 'b', symbol: 'B', name: 'B', decimals: 6 },
      reserves: { token0: '10', token1: '20' },
      cashReserves: { token0: '10', token1: '20' },
      totalDebts: { token0: '1000000000', token1: '2000000' },
      oraclePrices: {}, spotPrices: {}, rates: {}, totalCollaterals: {}, utilization: {},
    };
  });
  t.mock.method(helpers, 'calculateAPR', async () => ({}));
  t.mock.method(helpers, 'calculateTotalFeesPaid', async () => ({}));
  t.mock.method(helpers, 'calculateSwapVolume', async () => ({}));
  t.mock.method(console, 'error', () => {});
  let price = 2;
  let available = true;
  const fetchPrices = t.mock.method(pricing, 'fetchTokenPrices', async () => available ? new Map([
    ['a', { price, decimals: 9 }],
    ['b', { price: 3, decimals: 6 }],
  ]) : new Map());

  async function requestPools() {
    let body: any;
    const response = { json: (value: unknown) => { body = value; }, status: () => response };
    await PoolController.getPools({ query: {} } as any, response as any);
    assert.equal(body.success, true);
    return body.data.pools;
  }

  const first = await requestPools();
  assert.equal(first[0].tvl_usd, 80);
  assert.equal(first[0].total_debt_usd, 8);
  assert.ok(Number.isFinite(Date.parse(first[0].valuation_updated_at)));
  assert.equal(first[1].tvl_usd, null);
  assert.equal(first[1].total_debt_usd, null);
  assert.equal(first[1].valuation_updated_at, null);

  price = 4;
  assert.deepEqual(await requestPools(), first);
  assert.equal(fetchPrices.mock.callCount(), 1);
  cache.deleteByPrefix('pools:enriched:');
  const refreshed = await requestPools();
  assert.equal(refreshed[0].tvl_usd, 100);
  assert.equal(refreshed[0].total_debt_usd, 10);
  assert.equal(fetchPrices.mock.callCount(), 2);

  available = false;
  cache.deleteByPrefix('pools:enriched:');
  const unpriced = await requestPools();
  assert.equal(unpriced[0].tvl_usd, null);
  assert.equal(unpriced[0].total_debt_usd, null);
  assert.equal(unpriced[0].reserves.token0, '10');
});
