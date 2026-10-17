import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import pool from '../config/database';
import { CoinGeckoController } from '../controllers/coingeckoController';
import { CmcApiController } from '../controllers/cmcApiController';
import * as helpers from '../controllers/helpers/controllerBase';
import * as pricing from '../services/jupiterPriceService';
import { cache } from '../utils/cache';

async function request(handler: (req: Request, res: Response) => Promise<void>): Promise<any> {
  let body: any;
  let status = 200;
  const response = {
    json: (value: unknown) => { body = value; },
    status: (value: number) => { status = value; return response; },
  };
  await handler({ query: {} } as Request, response as unknown as Response);
  assert.equal(status, 200);
  return body;
}

for (const [name, handler, readValue, oldValue, newValue] of [
  ['CoinGecko tickers', CoinGeckoController.getTickers, (body: any) => body[0].last_price, '1', '4'],
  ['CMC summary', CmcApiController.getSummary, (body: any) => body[0].last_price, 1, 4],
  ['CMC assets', CmcApiController.getAssets, (body: any) => body.a.name, 'A1', 'A4'],
  ['CMC ticker', CmcApiController.getTicker, (body: any) => Object.values<any>(body)[0].last_price, '1', '4'],
] as const) {
  test(`${name} waits for fresh pools before rebuilding its expired cache`, { timeout: 2000 }, async (t) => {
    cache.clear();
    t.after(() => cache.clear());
    const state = { now: 1000, value: 1, gate: null as Promise<void> | null };
    t.mock.method(Date, 'now', () => state.now);
    const queries = t.mock.method(pool, 'query', async (sql: string) => {
      if (/FROM pools\s/.test(sql)) {
        if (state.gate) await state.gate;
        return { rows: [{ id: 1, pair_address: 'pair-a', token0: 'a', token1: 'b' }] };
      }
      return { rows: [] };
    });
    t.mock.method(helpers, 'initializePairStateService', async () => ({}));
    t.mock.method(helpers, 'fetchCachedPairState', async () => ({
      token0: { address: 'a', symbol: 'A', name: `A${state.value}`, decimals: 6 },
      token1: { address: 'b', symbol: 'B', name: 'B', decimals: 6 },
      reserves: { token0: '1', token1: String(state.value) },
      cashReserves: { token0: '1', token1: String(state.value) },
      totalDebts: { token0: '0', token1: '0' },
      totalCollaterals: { token0: '0', token1: '0' },
      oraclePrices: {}, spotPrices: {}, rates: {}, utilization: {},
    }));
    t.mock.method(helpers, 'calculateAPR', async () => ({}));
    t.mock.method(helpers, 'calculateTotalFeesPaid', async () => ({}));
    t.mock.method(helpers, 'calculateSwapVolume', async () => ({}));
    t.mock.method(pricing, 'fetchTokenPrices', async () => new Map([
      ['a', { price: 1, decimals: 6 }],
      ['b', { price: 1, decimals: 6 }],
    ]));

    assert.equal(readValue(await request(handler)), oldValue);
    state.now += 24 * 60 * 60 * 1000;
    state.value = 4;
    let release!: () => void;
    state.gate = new Promise<void>((resolve) => { release = resolve; });
    let finished = false;
    const first = request(handler).then((body) => { finished = true; return body; });
    const second = request(handler);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const returnedBeforeRefresh = finished;
    release();
    const responses = await Promise.all([first, second]);
    state.gate = null;

    assert.equal(returnedBeforeRefresh, false);
    for (const body of responses) assert.equal(readValue(body), newValue);
    assert.equal(readValue(await request(handler)), newValue);
    assert.equal(queries.mock.calls.filter(call => /FROM pools\s/.test(String(call.arguments[0]))).length, 2);
  });
}
