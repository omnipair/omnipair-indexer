import test, { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import pool from '../config/database';
import { loadOmnipairIdl } from '../config/idl-loader';
import { PoolController } from '../controllers/poolController';
import * as helpers from '../controllers/helpers/controllerBase';
import { PairStateService } from '../services/PairStateService';
import * as pricing from '../services/jupiterPriceService';
import * as simulation from '../utils/pairSimulation';
import { cache } from '../utils/cache';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

async function setup(t: TestContext, count = 3) {
  cache.clear();
  t.after(() => cache.clear());
  const state = {
    now: 1000,
    missing: new Set<string>(),
    unavailable: false,
    gate: null as Promise<void> | null,
  };
  t.mock.method(Date, 'now', () => state.now);
  t.mock.method(console, 'error', () => {});
  const service = new PairStateService('http://localhost:8899');
  service.initializeProgram(loadOmnipairIdl());
  const program = service.getProgram()!;
  const token0 = PublicKey.unique();
  const token1 = PublicKey.unique();
  const lpMint = PublicKey.unique();
  const account: simulation.PairAccount = {
    token0, token1, lpMint, rateModel: PublicKey.unique(),
    swapFeeBps: 30, halfLife: new BN(600), fixedCfBps: null,
    reserve0: new BN(10_000_000), reserve1: new BN(20_000_000),
    cashReserve0: new BN(9_000_000), cashReserve1: new BN(18_000_000),
    lastPrice0Ema: { symmetric: new BN(1), directional: new BN(1) },
    lastPrice1Ema: { symmetric: new BN(1), directional: new BN(1) },
    lastUpdate: new BN(1), lastRate0: new BN(1), lastRate1: new BN(1),
    totalDebt0: new BN(1_000_000), totalDebt1: new BN(2_000_000),
    totalDebt0Shares: new BN(1), totalDebt1Shares: new BN(1),
    totalSupply: new BN(3_000_000),
    totalCollateral0: new BN(4_000_000), totalCollateral1: new BN(5_000_000),
    token0Decimals: 6, token1Decimals: 6,
    paramsHash: Array(32).fill(0), version: 1, bump: 255,
    vaultBumps: { reserve0: 255, reserve1: 255, collateral0: 255, collateral1: 255 },
    reduceOnly: false,
  };
  const data = await program.coder.accounts.encode('pair', account);
  const accountInfo = { data, executable: false, owner: program.programId, lamports: 1, rentEpoch: 0 };
  const rows = Array.from({ length: count }, (_, index) => ({
    id: index + 1, pair_address: PublicKey.unique().toBase58(),
    token0: token0.toBase58(), token1: token1.toBase58(), swap_fee_bps: 30, fixed_cf_bps: null,
  }));
  for (const [mint, symbol] of [[token0, 'A'], [token1, 'B']] as const) {
    cache.set(`token_metadata_${mint}`, { address: mint.toBase58(), symbol, name: symbol, decimals: 6 });
  }
  cache.set(`lp_decimals_${lpMint}`, 6);
  t.mock.method(pool, 'query', async (sql: string) => ({
    rows: sql.includes('pool_category_assignments') ? [] : rows,
  }));
  t.mock.method(helpers, 'initializePairStateService', async () => service);
  t.mock.method(helpers, 'calculateAPR', async () => ({ apr: 7 }));
  t.mock.method(helpers, 'calculateTotalFeesPaid', async () => ({}));
  t.mock.method(helpers, 'calculateSwapVolume', async () => ({}));
  t.mock.method(pricing, 'fetchTokenPrices', async () => new Map([
    [token0.toBase58(), { price: 2, decimals: 6 }],
    [token1.toBase58(), { price: 3, decimals: 6 }],
  ]));
  // Exercise Anchor's actual account decoding and 99-account RPC chunking.
  const batchRead = t.mock.method(service.getConnection(), 'getMultipleAccountsInfoAndContext', async (keys: PublicKey[]) => {
    if (state.gate) await state.gate;
    if (state.unavailable) throw new Error('RPC unavailable');
    return { context: { slot: 1 }, value: keys.map((key) => state.missing.has(key.toBase58()) ? null : accountInfo) };
  });
  const singleRead = t.mock.method(service.getConnection(), 'getAccountInfoAndContext', async () => ({
    context: { slot: 1 }, value: accountInfo,
  }));
  const simulations = t.mock.method(simulation, 'simulatePairGetter', async (...args: Parameters<typeof simulation.simulatePairGetter>) => ({
    label: Object.keys(args[4])[0], value0: '1000000000', value1: '2000000000', value2: '0',
  }));
  return { state, service, rows, batchRead, singleRead, simulations };
}

test('pool refresh batches 100 account reads into two RPCs and preserves enrichment', async (t) => {
  const { rows, batchRead, singleRead, simulations } = await setup(t, 100);
  const pools = await PoolController.fetchAllPools(false);

  assert.deepEqual(batchRead.mock.calls.map((call) => call.arguments[0].length), [99, 1]);
  assert.equal(singleRead.mock.callCount(), 0);
  assert.equal(simulations.mock.callCount(), 300);
  assert.deepEqual(pools.map((value) => value.pair_address), rows.map((row) => row.pair_address));
  assert.deepEqual(pools[0].reserves, { token0: '10', token1: '20' });
  assert.deepEqual(pools[0].cash_reserves, { token0: '9', token1: '18' });
  assert.deepEqual(pools[0].total_debts, { token0: '1000000', token1: '2000000' });
  assert.deepEqual(pools[0].total_collaterals, { token0: '4000000', token1: '5000000' });
  assert.deepEqual(pools[0].oracle_prices, { token0: '1', token1: '1' });
  assert.deepEqual(pools[0].interest_rates, { token0: 100, token1: 200 });
  assert.deepEqual(pools[0].lp_token, { total_supply: '3000000', decimals: 6 });
  assert.equal(pools[0].tvl_usd, 80);
  assert.equal(pools[0].total_debt_usd, 8);
  assert.equal(pools[0].apr.apr, 7);

  assert.deepEqual(await PoolController.fetchAllPools(false), pools);
  assert.equal(batchRead.mock.callCount(), 2);
  assert.equal(simulations.mock.callCount(), 300);
});

test('pool refresh skips cached pair states and shares them with individual callers until expiry', async (t) => {
  const { state, service, rows, batchRead, singleRead, simulations } = await setup(t);
  const first = await helpers.fetchCachedPairState(service, rows[0].pair_address);
  assert.equal(singleRead.mock.callCount(), 1);
  await PoolController.fetchAllPools(false);
  assert.deepEqual(batchRead.mock.calls[0].arguments[0].map((key) => key.toBase58()), rows.slice(1).map((row) => row.pair_address));
  assert.equal(simulations.mock.callCount(), 9);
  assert.deepEqual(await helpers.fetchCachedPairState(service, rows[0].pair_address), first);

  cache.deleteByPrefix('pools:enriched:');
  await PoolController.fetchAllPools(false);
  assert.equal(batchRead.mock.callCount(), 1);
  assert.equal(singleRead.mock.callCount(), 1);
  assert.equal(simulations.mock.callCount(), 9);

  state.now += 5_000;
  cache.deleteByPrefix('pools:enriched:');
  await PoolController.fetchAllPools(false);
  assert.equal(batchRead.mock.callCount(), 2);
  assert.equal(batchRead.mock.calls[1].arguments[0].length, 3);
  assert.equal(singleRead.mock.callCount(), 1);
  assert.equal(simulations.mock.callCount(), 18);
});

test('concurrent visible and all-pool refreshes share in-flight pair reads', async (t) => {
  const { state, service, rows, batchRead, singleRead, simulations } = await setup(t);
  let release!: () => void;
  state.gate = new Promise<void>((resolve) => { release = resolve; });
  const visible = PoolController.fetchAllPools(false);
  await flush();
  const all = PoolController.fetchAllPools(true);
  const individual = helpers.fetchCachedPairState(service, rows[0].pair_address);
  await flush();
  const callsBeforeRelease = batchRead.mock.callCount();
  release();
  const [visiblePools, allPools] = await Promise.all([visible, all, individual]);
  assert.equal(callsBeforeRelease, 1);
  assert.equal(batchRead.mock.callCount(), 1);
  assert.equal(singleRead.mock.callCount(), 0);
  assert.equal(simulations.mock.callCount(), 9);
  assert.deepEqual(visiblePools, allPools);
});

test('a missing account falls back only for its pool without individual retries', async (t) => {
  const { state, rows, batchRead, singleRead, simulations } = await setup(t);
  state.missing.add(rows[1].pair_address);
  const pools = await PoolController.fetchAllPools(false);
  assert.deepEqual(pools.map((value) => value.tvl_usd), [80, null, 80]);
  assert.equal(batchRead.mock.callCount(), 1);
  assert.equal(singleRead.mock.callCount(), 0);
  assert.equal(simulations.mock.callCount(), 6);
});

test('batch failures use existing pool fallbacks and retry on the next refresh', async (t) => {
  const { state, batchRead, singleRead } = await setup(t);
  state.unavailable = true;
  const unavailable = await PoolController.fetchAllPools(false);
  assert.deepEqual(unavailable.map((value) => value.tvl_usd), [null, null, null]);
  assert.equal(batchRead.mock.callCount(), 1);
  assert.equal(singleRead.mock.callCount(), 0);
  state.unavailable = false;
  cache.deleteByPrefix('pools:enriched:');
  const recovered = await PoolController.fetchAllPools(false);
  assert.deepEqual(recovered.map((value) => value.tvl_usd), [80, 80, 80]);
  assert.equal(batchRead.mock.callCount(), 2);
  assert.equal(singleRead.mock.callCount(), 0);
});

test('an empty pool list makes no account reads or simulations', async (t) => {
  const { batchRead, singleRead, simulations } = await setup(t, 0);
  assert.deepEqual(await PoolController.fetchAllPools(false), []);
  assert.equal(batchRead.mock.callCount(), 0);
  assert.equal(singleRead.mock.callCount(), 0);
  assert.equal(simulations.mock.callCount(), 0);
});
