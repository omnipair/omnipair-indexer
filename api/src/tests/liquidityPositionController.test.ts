import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import pool from '../config/database';
import { PositionController } from '../controllers/positionController';
import * as balances from '../services/walletLpBalanceService';
import * as metrics from '../services/lpPositionMetricsService';
import * as helpers from '../controllers/helpers/controllerBase';
import * as simulation from '../utils/pairSimulation';
import { cache } from '../utils/cache';

const key = (value: number) => new PublicKey(new Uint8Array(32).fill(value)).toBase58();
const alice = key(1);
const bob = key(2);
const pair = key(3);
const holding = (lpAmount: string): balances.WalletLpBalance => ({
  pair, lpAmount, lpMint: key(4), token0Mint: key(5), token1Mint: key(6),
});

function setup(t: TestContext) {
  cache.clear();
  t.after(() => cache.clear());
  t.mock.method(helpers, 'initializePairStateService', async () => ({ getProgram: () => ({}) }));
  t.mock.method(simulation, 'fetchPairAccounts', async () => new Map());
  t.mock.method(metrics, 'getLpPositionMetricsForRows', async () => new Map());
}

async function request(query: Record<string, string>) {
  let body: any;
  let status = 200;
  const response = {
    json: (value: unknown) => { body = value; },
    status: (value: number) => { status = value; return response; },
  };
  await PositionController.getAllLiquidityPositions({ query } as any, response as any);
  return { body, status };
}

test('a full transfer removes the sender and discovers a recipient with no indexed position', async (t) => {
  setup(t);
  t.mock.method(balances, 'fetchWalletLpBalances', async (wallet: string) => wallet === alice ? [] : [holding('100')]);
  t.mock.method(pool, 'query', async (_sql: string, params: unknown[]) => {
    assert.equal(params[0], bob);
    return { rows: [] };
  });

  const sender = await request({ userAddress: alice });
  assert.equal(sender.status, 200);
  assert.deepEqual(sender.body.data.positions, []);
  assert.equal(sender.body.data.pagination.total, 0);
  const recipient = await request({ userAddress: bob });
  assert.equal(recipient.status, 200);
  assert.equal(recipient.body.data.positions[0].signer, bob);
  assert.equal(recipient.body.data.positions[0].lpAmount, '100');
  assert.equal(recipient.body.data.positions[0].lpMint, key(4));
  assert.equal(recipient.body.data.positions[0].timestamp, null);
});

test('a partial transfer uses actual balances even when indexed amounts are stale', async (t) => {
  setup(t);
  t.mock.method(balances, 'fetchWalletLpBalances', async (wallet: string) => [holding(wallet === alice ? '60' : '40')]);
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
