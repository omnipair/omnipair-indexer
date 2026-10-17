import test, { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import pool from '../config/database';
import { PoolController } from '../controllers/poolController';
import { StatsController } from '../controllers/statsController';
import * as helpers from '../controllers/helpers/controllerBase';
import * as pricing from '../services/jupiterPriceService';
import { startPoolInvalidationListener, stopPoolInvalidationListener } from '../services/poolInvalidationService';
import { cache } from '../utils/cache';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => { resolve = res; });
  return { promise, resolve };
}

async function request(handler: (req: Request, res: Response) => Promise<void>, query = {}): Promise<any> {
  let body: any;
  let status = 200;
  const response = {
    json: (value: unknown) => { body = value; },
    status: (value: number) => { status = value; return response; },
  };
  await handler({ query } as Request, response as unknown as Response);
  assert.equal(status, 200);
  assert.equal(body.success, true);
  return body.data;
}

function setup(t: TestContext) {
  cache.clear();
  t.after(() => cache.clear());
  const state = { now: 1000, value: 1, visible: true, gate: null as Promise<void> | null };
  t.mock.method(Date, 'now', () => state.now);
  const queries = t.mock.method(pool, 'query', async (sql: string) => {
    const value = state.value;
    if (state.gate) await state.gate;
    if (sql.includes('pool_category_assignments')) return { rows: [] };
    if (/FROM pools\s/.test(sql)) {
      return { rows: state.visible || !sql.includes('visible = TRUE')
        ? [{ id: 1, pair_address: 'pair-a', token0: 'a', token1: 'b' }] : [] };
    }
    // Covers all summary/chart queries, with fields selected by each controller.
    return { rows: [{
      day: new Date('2026-10-17T00:00:00Z'), pair: 'pair-a', token0: 'a', token1: 'b',
      total_volume: value, volume_24h: value, volume: value,
      total_fees: value, fees_24h: value, total_lp_fees: value, lp_fees_24h: value,
      total_protocol_fees: value, protocol_fees_24h: value, lp_fees: value, protocol_fees: value,
      total_swaps: value, swaps_24h: value, swap_count: value,
      total_accrued0: value, total_accrued1: value, accrued0_24h: value, accrued1_24h: value,
      total_lp0: value, total_lp1: value, lp0_24h: value, lp1_24h: value,
      total_protocol0: value, total_protocol1: value, protocol0_24h: value, protocol1_24h: value,
      accrued0: value, accrued1: value, lp0: value, lp1: value, protocol0: value, protocol1: value,
    }] };
  });
  t.mock.method(helpers, 'initializePairStateService', async () => ({}));
  t.mock.method(helpers, 'fetchCachedPairState', async () => ({
    token0: { address: 'a', symbol: 'A', name: 'A', decimals: 6 },
    token1: { address: 'b', symbol: 'B', name: 'B', decimals: 6 },
    reserves: { token0: String(state.value), token1: String(state.value) },
    cashReserves: { token0: String(state.value), token1: String(state.value) },
    totalDebts: { token0: '1000000', token1: '1000000' },
    totalCollaterals: { token0: '0', token1: '0' },
    oraclePrices: {}, spotPrices: {}, rates: {}, utilization: {},
  }));
  t.mock.method(helpers, 'calculateAPR', async () => ({}));
  t.mock.method(helpers, 'calculateTotalFeesPaid', async () => ({}));
  t.mock.method(helpers, 'calculateSwapVolume', async () => ({}));
  const prices = t.mock.method(pricing, 'fetchTokenPrices', async () => {
    if (state.gate) await state.gate;
    return new Map([
      ['a', { price: state.value, decimals: 6 }],
      ['b', { price: state.value, decimals: 6 }],
    ]);
  });
  return { state, queries, prices };
}

for (const visibility of ['visible', 'all']) {
  test(`${visibility} pool lists serve 200-second-old data and retain it through cleanup during one refresh`, { timeout: 2000 }, async (t) => {
    const { state, queries } = setup(t);
    const first = await request(PoolController.getPools, { visibility });
    assert.equal(first.pools[0].tvl_usd, 2);
    state.value = 2;
    state.now += 200_000;
    cache.cleanup();
    const gate = deferred();
    state.gate = gate.promise;
    assert.deepEqual(await request(PoolController.getPools, { visibility }), first);
    state.now += 24 * 60 * 60 * 1000;
    cache.cleanup();
    assert.deepEqual(await request(PoolController.getPools, { visibility }), first);
    assert.equal(queries.mock.calls.filter(call => /FROM pools\s/.test(String(call.arguments[0]))).length, 2);
    gate.resolve();
    await PoolController.fetchAllPools(visibility === 'all', false);
    state.gate = null;
    assert.equal((await request(PoolController.getPools, { visibility })).pools[0].tvl_usd, 8);
  });
}

test('summary stats serve cached TVL and prices while waiting for a fresh pool snapshot', { timeout: 2000 }, async (t) => {
  const { state, prices } = setup(t);
  const first = await request(StatsController.getStats);
  assert.equal(first.tvl, 2);
  assert.equal(first.total_volume, 1);
  const priceCalls = prices.mock.callCount();
  assert.deepEqual(await request(StatsController.getStats), first);
  assert.equal(prices.mock.callCount(), priceCalls);

  state.now += 15_000;
  state.value = 2;
  const gate = deferred();
  state.gate = gate.promise;
  assert.deepEqual(await request(StatsController.getStats), first);
  assert.deepEqual(await request(StatsController.getStats), first);
  await flush();
  // TVL must not cache a stale pool list while its background refresh is pending.
  assert.equal(cache.get('stats:tvl'), null);
  gate.resolve();
  await flush();
  state.gate = null;
  const refreshed = await request(StatsController.getStats);
  assert.equal(refreshed.tvl, 8);
  assert.equal(refreshed.total_volume, 2);

  state.now += 200_000;
  cache.cleanup();
  state.value = 3;
  const oldDataGate = deferred();
  state.gate = oldDataGate.promise;
  assert.deepEqual(await request(StatsController.getStats), refreshed);
  state.now += 24 * 60 * 60 * 1000;
  cache.cleanup();
  assert.deepEqual(await request(StatsController.getStats), refreshed);
  oldDataGate.resolve();
  await flush();
  state.gate = null;
  const current = await request(StatsController.getStats);
  assert.equal(current.tvl, 18);
  assert.equal(current.total_volume, 3);
});

test('TVL retains its last good value through a price outage, backs off, and recovers', { timeout: 2000 }, async (t) => {
  const fetchPrices = pricing.fetchTokenPrices;
  const { state, prices } = setup(t);
  prices.mock.mockImplementation(fetchPrices);
  t.mock.method(console, 'warn', () => {});
  let unavailable = false;
  let price = 1;
  t.mock.method(globalThis, 'fetch', async () => unavailable
    ? new Response('{}', { status: 503 })
    : new Response(JSON.stringify({ a: { usdPrice: price, decimals: 6 }, b: { usdPrice: price, decimals: 6 } })));

  assert.equal((await request(StatsController.getStats)).tvl, 2);
  // Expire both the overview cache and the price service's local quotes.
  state.now += 31_000;
  unavailable = true;
  assert.equal((await request(StatsController.getStats)).tvl, 2);
  await flush();
  assert.equal(cache.get('stats:tvl'), null); // The failed refresh must not become fresh.

  unavailable = false;
  price = 2;
  const callsAfterFailure = prices.mock.callCount();
  state.now += 4_999;
  assert.equal((await request(StatsController.getStats)).tvl, 2);
  assert.equal(prices.mock.callCount(), callsAfterFailure);

  state.now++;
  assert.equal((await request(StatsController.getStats)).tvl, 2);
  await flush();
  assert.equal((await request(StatsController.getStats)).tvl, 4);
});

for (const [name, handler] of [
  ['volume', StatsController.getVolumeChart],
  ['fees', StatsController.getFeesChart],
  ['interest', StatsController.getInterestChart],
  ['swap count', StatsController.getSwapCountChart],
] as const) {
  test(`${name} chart serves old data beyond 200 seconds while one refresh runs`, { timeout: 2000 }, async (t) => {
    const { state, queries } = setup(t);
    const first = await request(handler);
    assert.equal(first.length, 1);
    state.now += 60_000;
    state.value = 2;
    const gate = deferred();
    state.gate = gate.promise;
    assert.deepEqual(await request(handler), first);
    assert.deepEqual(await request(handler), first);
    assert.equal(queries.mock.callCount(), 2);
    state.now += 200_000;
    cache.cleanup();
    assert.deepEqual(await request(handler), first);
    assert.equal(queries.mock.callCount(), 2);
    gate.resolve();
    await flush();
    state.gate = null;
    assert.notDeepEqual(await request(handler), first);
  });
}

test('pool notifications remove both pool lists and cached stats TVL immediately', { timeout: 2000 }, async (t) => {
  const { state } = setup(t);
  t.mock.method(console, 'log', () => {});
  const listener = Object.assign(new EventEmitter(), {
    query: async () => ({}),
    release: () => {},
  });
  t.mock.method(pool, 'connect', async () => listener);
  await startPoolInvalidationListener();
  t.after(() => stopPoolInvalidationListener());
  assert.equal((await request(StatsController.getStats)).pool_count, 1);
  assert.equal((await request(PoolController.getPools, { visibility: 'all' })).pools.length, 1);

  state.visible = false;
  listener.emit('notification', { channel: 'pool_updates', payload: JSON.stringify({ op: 'UPDATE', pair: 'pair-a' }) });
  assert.equal(cache.get('pools:enriched:visible'), null);
  assert.equal(cache.get('pools:enriched:all'), null);
  assert.equal(cache.get('stats:tvl'), null);
  assert.equal((await request(PoolController.getPools)).pools.length, 0);
  const stats = await request(StatsController.getStats);
  assert.equal(stats.pool_count, 0);
  assert.equal(stats.tvl, 0);
});
