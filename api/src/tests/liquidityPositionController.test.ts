import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import express from 'express';
import type { AddressInfo } from 'node:net';
import pool from '../config/database';
import { PositionController } from '../controllers/positionController';
import * as balances from '../services/walletLpBalanceService';
import * as metrics from '../services/lpPositionMetricsService';
import * as helpers from '../controllers/helpers/controllerBase';
import * as simulation from '../utils/pairSimulation';
import * as prices from '../services/tokenPriceSnapshotService';
import { cache } from '../utils/cache';
import positionsRoutes from '../routes/v1/positionsRoutes';
import usersRoutes from '../routes/v1/usersRoutes';

const key = (value: number) => new PublicKey(new Uint8Array(32).fill(value)).toBase58();
const alice = key(1);
const bob = key(2);
const pair = key(3);
const holding = (lpAmount: string): balances.WalletLpBalance => ({
  pair, lpAmount, lpMint: key(4), token0Mint: key(5), token1Mint: key(6),
});

function snapshot(holdings: balances.WalletLpBalance[]): balances.WalletLpBalanceSnapshot {
  return { holdings, observation: {
    commitment: 'confirmed', observedAt: '2026-10-12T18:00:00.000Z', slotsByTokenProgram: { token: 123 },
  } };
}

function setup(t: TestContext, mockMetrics = true) {
  cache.clear();
  t.after(() => cache.clear());
  t.mock.method(helpers, 'initializePairStateService', async () => ({ getProgram: () => ({}) }));
  const pairFetch = t.mock.method(simulation, 'fetchPairAccounts', async (_program: unknown, pairs: string[]) => new Map(
    pairs.map((address) => [address, {
      totalSupply: 100n, reserve0: 1000n, reserve1: 2000n,
      token0: new PublicKey(key(5)), token1: new PublicKey(key(6)),
    }])
  ));
  if (mockMetrics) t.mock.method(metrics, 'getLpPositionMetricsForRows', async () => new Map());
  return { pairFetch };
}

async function request(query: Record<string, string>) {
  let body: any;
  let status = 200;
  const headers: Record<string, unknown> = {};
  const response = {
    setHeader: (key: string, value: unknown) => { headers[key] = value; },
    json: (value: unknown) => { body = value; },
    status: (value: number) => { status = value; return response; },
  };
  await PositionController.getAllLiquidityPositions({ query } as any, response as any);
  return { body, status, headers };
}

test('a full transfer removes the sender and discovers a recipient with no indexed position', async (t) => {
  setup(t);
  t.mock.method(balances, 'fetchWalletLpBalances', async (wallet: string) => snapshot(wallet === alice ? [] : [holding('100')]));
  t.mock.method(pool, 'query', async (_sql: string, params: unknown[]) => {
    assert.equal(params[0], bob);
    return { rows: [] };
  });

  const sender = await request({ userAddress: alice });
  assert.equal(sender.status, 200);
  assert.deepEqual(sender.body.data.positions, []);
  assert.equal(sender.body.data.pagination.total, 0);
  assert.deepEqual(sender.body.data.balanceObservation, snapshot([]).observation);
  const recipient = await request({ userAddress: bob });
  assert.equal(recipient.status, 200);
  assert.equal(recipient.body.data.positions[0].signer, bob);
  assert.equal(recipient.body.data.positions[0].lpAmount, '100');
  assert.equal(recipient.body.data.positions[0].lpMint, key(4));
  assert.equal(recipient.body.data.positions[0].timestamp, null);
});

test('a partial transfer uses actual balances even when indexed amounts are stale', async (t) => {
  setup(t);
  t.mock.method(balances, 'fetchWalletLpBalances', async (wallet: string) => snapshot([holding(wallet === alice ? '60' : '40')]));
  t.mock.method(pool, 'query', async () => ({ rows: [{
    pair, amount0: '1000', amount1: '2000', updated_at: new Date('2026-01-01'),
  }] }));
  assert.equal((await request({ userAddress: alice })).body.data.positions[0].lpAmount, '60');
  assert.equal((await request({ userAddress: bob })).body.data.positions[0].lpAmount, '40');
});

test('the global listing continues to use indexed positions', async (t) => {
  setup(t);
  t.mock.method(balances, 'fetchWalletLpBalances', async () => { throw new Error('Unexpected wallet lookup'); });
  t.mock.method(pool, 'query', async (sql: string) => ({ rows: sql.includes('COUNT(*)') ? [{ total_count: '1' }] : [{
    signer: alice, pair, token0_mint: key(5), token1_mint: key(6),
    lp_mint: key(4), lp_amount: '100', amount0: '1000', amount1: '2000', updated_at: new Date('2026-01-01'),
  }] }));
  const result = await request({});
  assert.equal(result.status, 200);
  assert.equal(result.body.data.positions[0].lpAmount, '100');
  assert.equal(result.body.data.pagination.total, 1);
});

test('raw amounts and current USD value share one batch of live pool states', async (t) => {
  const { pairFetch } = setup(t, false);
  t.mock.method(balances, 'fetchWalletLpBalances', async () => snapshot([holding('60')]));
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  t.mock.method(prices, 'getCurrentTokenPrices', async () => new Map([
    [key(5), { priceUsd: 2, decimals: 0, quality: 'current' }],
    [key(6), { priceUsd: 3, decimals: 0, quality: 'current' }],
  ]));
  const result = await request({ userAddress: alice });
  assert.equal(result.status, 200);
  const position = result.body.data.positions[0];
  assert.equal(position.amount0, '600');
  assert.equal(position.amount1, '1200');
  assert.equal(position.valueDelta.currentValue.token0Amount, position.amount0);
  assert.equal(position.valueDelta.currentValue.token1Amount, position.amount1);
  assert.equal(position.valueDelta.currentValue.usd, '4800');
  assert.equal(pairFetch.mock.callCount(), 1);
});

test('wallet filtering and deterministic sorting precede totals and pagination', async (t) => {
  setup(t);
  const holdings = [7, 3, 8].map((value) => ({ ...holding('10'), pair: key(value) }));
  t.mock.method(balances, 'fetchWalletLpBalances', async () => snapshot(holdings));
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  const sortedPairs = holdings.map((value) => value.pair).sort();
  const page = (await request({ userAddress: alice, limit: '1', offset: '1' })).body.data;
  assert.equal(page.positions[0].pair, sortedPairs[1]);
  assert.deepEqual(page.pagination, { total: 3, limit: 1, offset: 1, hasNext: true });

  const filtered = (await request({ userAddress: alice, poolAddress: key(7), limit: '1' })).body.data;
  assert.deepEqual(filtered.positions.map((position: any) => position.pair), [key(7)]);
  assert.deepEqual(filtered.pagination, { total: 1, limit: 1, offset: 0, hasNext: false });
  const afterLast = (await request({ userAddress: alice, poolAddress: key(7), offset: '1' })).body.data;
  assert.deepEqual(afterLast.positions, []);
  assert.equal(afterLast.pagination.total, 1);
  assert.equal(afterLast.pagination.hasNext, false);
});

test('invalid public keys and unsupported wallet status fail before any RPC lookup', async (t) => {
  setup(t);
  const lookup = t.mock.method(balances, 'fetchWalletLpBalances', async () => snapshot([]));
  const queries: Record<string, string>[] = [
    { userAddress: '0'.repeat(44) },
    { userAddress: alice, poolAddress: 'not-a-public-key' },
    { userAddress: alice, status: 'closed' },
  ];
  for (const query of queries) {
    assert.equal((await request(query)).status, 400);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('all wallet liquidity route aliases use the same holdings implementation', async (t) => {
  setup(t);
  t.mock.method(balances, 'fetchWalletLpBalances', async (wallet: string) => {
    assert.equal(wallet, alice);
    return snapshot([holding('60')]);
  });
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  const app = express();
  app.use('/api/v1/positions', positionsRoutes);
  app.use('/api/v1/users', usersRoutes);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const route of [
    `/api/v1/positions/liquidity?userAddress=${alice}`,
    `/api/v1/positions?userAddress=${alice}&type=liquidity`,
    `/api/v1/users/${alice}/positions?type=liquidity`,
  ]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json() as any;
    assert.equal(body.data.positions[0].lpAmount, '60');
    assert.equal(body.data.positions[0].signer, alice);
  }
});

test('completed wallet responses are refreshed, including same-millisecond requests', async (t) => {
  setup(t);
  t.mock.method(Date, 'now', () => 1000);
  let amount = '100';
  const lookup = t.mock.method(balances, 'fetchWalletLpBalances', async () => snapshot([holding(amount)]));
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  const before = await request({ userAddress: alice });
  assert.equal(before.body.data.positions[0].lpAmount, '100');
  amount = '60';
  const after = await request({ userAddress: alice });
  assert.equal(after.body.data.positions[0].lpAmount, '60');
  assert.equal(lookup.mock.callCount(), 2);
  assert.equal(after.headers['Cache-Control'], 'no-store');
  assert.deepEqual(after.body.data.balanceObservation, snapshot([]).observation);
});

test('concurrent identical requests share work and are not retained afterward', async (t) => {
  setup(t);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const lookup = t.mock.method(balances, 'fetchWalletLpBalances', async () => {
    await pending;
    return snapshot([holding('60')]);
  });
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  const first = request({ userAddress: alice });
  const second = request({ userAddress: alice });
  assert.equal(lookup.mock.callCount(), 1);
  release();
  const responses = await Promise.all([first, second]);
  assert.deepEqual(responses[0].body, responses[1].body);
  await request({ userAddress: alice });
  assert.equal(lookup.mock.callCount(), 2);
});

test('balance failures return a retryable 503 without querying stale positions', async (t) => {
  setup(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(balances, 'fetchWalletLpBalances', async () => {
    throw new balances.LiveLpDataUnavailableError('RPC unavailable',
      Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT' }));
  });
  const dbQuery = t.mock.method(pool, 'query', async () => { throw new Error('Unexpected stale fallback'); });
  const result = await request({ userAddress: alice });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'LIVE_LP_DATA_UNAVAILABLE');
  assert.equal(result.body.retryable, true);
  assert.equal(result.headers['Retry-After'], '1');
  assert.equal(result.body.data, undefined);
  assert.equal(dbQuery.mock.callCount(), 0);
});

test('missing live pool state returns a nonretryable error without stale valuation', async (t) => {
  const { pairFetch } = setup(t);
  pairFetch.mock.mockImplementation(async () => new Map());
  t.mock.method(console, 'error', () => {});
  t.mock.method(balances, 'fetchWalletLpBalances', async () => snapshot([holding('60')]));
  t.mock.method(pool, 'query', async () => ({ rows: [{ pair, amount0: '9999', amount1: '9999' }] }));
  const result = await request({ userAddress: alice });
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'LIVE_LP_DATA_ERROR');
  assert.equal(result.body.retryable, false);
  assert.equal(result.headers['Retry-After'], undefined);
  assert.equal(result.body.data, undefined);
});

test('pool RPC outages remain retryable while decoding errors do not', async (t) => {
  const { pairFetch } = setup(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(balances, 'fetchWalletLpBalances', async () => snapshot([holding('60')]));
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  for (const [error, expectedStatus, retryable] of [
    [new Error('503 Service Unavailable: upstream outage'), 503, true],
    [new Error('Invalid account discriminator'), 500, false],
    [new RangeError('Attempt to access memory outside buffer bounds'), 500, false],
  ] as const) {
    pairFetch.mock.mockImplementation(async () => { throw error; });
    const result = await request({ userAddress: alice });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.body.retryable, retryable);
    assert.equal(result.headers['Retry-After'], retryable ? '1' : undefined);
    assert.equal(result.body.data, undefined);
  }
});

test('invalid program configuration is not advertised as a temporary outage', async (t) => {
  setup(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(balances, 'fetchWalletLpBalances', async () => snapshot([holding('60')]));
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  t.mock.method(helpers, 'initializePairStateService', async () => { throw new Error('Omnipair IDL not found'); });
  const result = await request({ userAddress: alice });
  assert.equal(result.status, 500);
  assert.equal(result.body.retryable, false);
  assert.equal(result.headers['Retry-After'], undefined);
});

test('permanent token-account failures return no retry hint or partial holdings', async (t) => {
  setup(t);
  t.mock.method(console, 'error', () => {});
  t.mock.method(balances, 'fetchWalletLpBalances', async () => {
    throw new balances.LiveLpDataUnavailableError('Unable to read wallet LP balances',
      new Error('401 Unauthorized: invalid RPC key'));
  });
  const result = await request({ userAddress: alice });
  assert.equal(result.status, 500);
  assert.equal(result.body.code, 'LIVE_LP_DATA_ERROR');
  assert.equal(result.body.retryable, false);
  assert.equal(result.headers['Retry-After'], undefined);
  assert.equal(result.body.data, undefined);
});

test('large underlying balances remain exact in both raw and current-value response fields', async (t) => {
  const { pairFetch } = setup(t, false);
  pairFetch.mock.mockImplementation(async () => new Map([[pair, {
    totalSupply: 100n, reserve0: 9007199254740997n, reserve1: 18446744073709551615n,
    token0: new PublicKey(key(5)), token1: new PublicKey(key(6)),
  }]]));
  t.mock.method(balances, 'fetchWalletLpBalances', async () => snapshot([holding('100')]));
  t.mock.method(pool, 'query', async () => ({ rows: [] }));
  t.mock.method(prices, 'getCurrentTokenPrices', async () => new Map());
  const result = await request({ userAddress: alice });
  assert.equal(result.status, 200);
  const position = result.body.data.positions[0];
  assert.equal(position.amount0, '9007199254740997');
  assert.equal(position.amount1, '18446744073709551615');
  assert.equal(position.valueDelta.currentValue.token0Amount, position.amount0);
  assert.equal(position.valueDelta.currentValue.token1Amount, position.amount1);
});
