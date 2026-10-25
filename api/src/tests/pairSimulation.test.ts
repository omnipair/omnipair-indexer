import test, { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Connection, PublicKey, TransactionInstruction, Transaction, ComputeBudgetProgram, PACKET_DATA_SIZE } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import type { Omnipair } from '@omnipair/program-interface';
import { fetchPairAccounts, simulateUserPositionGetter, simulatePairGetter, simulatePairGetters, clearSimulationCache } from '../utils/pairSimulation';
import { loadOmnipairIdl } from '../config/idl-loader';
import { PairStateService } from '../services/PairStateService';
import type { GetterType } from '../types/pairTypes';

const PAIR_A = '7LVhVHctPuVnxjYv57jG1sYDttEV9uDSRN14dUAE3qXM';
const PAIR_B = 'CsGD9kfDEAeo49PNK8UuJ83kjEfFY4YVwAcKCAV3bJe7';

function fakeProgram(options: { fetchMultiple?: (keys: PublicKey[]) => unknown[] } = {}) {
  const calls = { fetch: 0, fetchMultiple: [] as string[][], rateModels: [] as string[] };
  const fetchedRateModel = PublicKey.unique();
  const program = {
    provider: {},
    account: {
      pair: {
        fetch: async () => {
          calls.fetch += 1;
          return { rateModel: fetchedRateModel };
        },
        fetchMultiple: async (keys: PublicKey[]) => {
          calls.fetchMultiple.push(keys.map((key) => key.toBase58()));
          return options.fetchMultiple ? options.fetchMultiple(keys) : keys.map(() => null);
        },
      },
    },
    methods: {
      viewUserPositionData: () => ({
        accounts: (accounts: { rateModel: PublicKey }) => {
          calls.rateModels.push(accounts.rateModel.toBase58());
          return {
            instruction: async () =>
              new TransactionInstruction({ programId: PublicKey.default, keys: [], data: Buffer.alloc(0) }),
          };
        },
      }),
    },
  };
  return { program: program as unknown as Program<Omnipair>, calls, fetchedRateModel };
}

const connection = {
  simulateTransaction: async () => ({
    value: { err: null, logs: ['Program log: UserDebtWithInterest: (U64(5), U64(7), U64(0))'] },
  }),
} as unknown as Connection;

test('fetchPairAccounts reads each distinct pair once in a single call', async () => {
  const { program, calls } = fakeProgram({
    fetchMultiple: (keys) => keys.map((key) => (key.toBase58() === PAIR_A ? { token0: 'a' } : null)),
  });

  const accounts = await fetchPairAccounts(program, [PAIR_A, PAIR_B, PAIR_A, PAIR_A]);

  assert.deepEqual(calls.fetchMultiple, [[PAIR_A, PAIR_B]]);
  assert.deepEqual(accounts.get(PAIR_A), { token0: 'a' });
  assert.equal(accounts.get(PAIR_B), null);
});

test('fetchPairAccounts makes no RPC call for an empty page', async () => {
  const { program, calls } = fakeProgram();

  const accounts = await fetchPairAccounts(program, []);

  assert.equal(accounts.size, 0);
  assert.equal(calls.fetchMultiple.length, 0);
});

test('simulateUserPositionGetter uses a supplied rate model without re-reading the pair', async () => {
  const { program, calls } = fakeProgram();
  const rateModel = PublicKey.unique();

  const result = await simulateUserPositionGetter(
    program,
    connection,
    new PublicKey(PAIR_A),
    PublicKey.unique(),
    { userDebtWithInterest: {} },
    rateModel,
  );

  assert.equal(calls.fetch, 0);
  assert.deepEqual(calls.rateModels, [rateModel.toBase58()]);
  assert.equal(result.value0, '5');
  assert.equal(result.value1, '7');
});

test('simulateUserPositionGetter reads the pair when no rate model is supplied', async () => {
  const { program, calls, fetchedRateModel } = fakeProgram();

  await simulateUserPositionGetter(
    program,
    connection,
    new PublicKey(PAIR_A),
    PublicKey.unique(),
    { userDebtWithInterest: {} },
  );

  assert.equal(calls.fetch, 1);
  assert.deepEqual(calls.rateModels, [fetchedRateModel.toBase58()]);
});

const overviewGetters: GetterType[] = [{ emaPrice0Nad: {} }, { emaPrice1Nad: {} }, { getRates: {} }];
const overviewLogs = [
  'Program log: EmaPrice0Nad: (U64(123456789), OptionalU64(None), OptionalU64(None))',
  'Program log: EmaPrice1Nad: (U64(9876543210), OptionalU64(None), OptionalU64(None))',
  'Program log: GetRates: (U64(10000000), U64(20000000), OptionalU64(None))',
];

function overviewFixture(t: TestContext) {
  clearSimulationCache();
  t.after(() => clearSimulationCache());
  const service = new PairStateService('http://localhost:8899');
  service.initializeProgram(loadOmnipairIdl());
  const program = service.getProgram()!;
  const connection = service.getConnection();
  const pair = new PublicKey(PAIR_A);
  const rateModel = PublicKey.unique();
  const state = { now: 1000, logs: overviewLogs, fail: false, gate: null as Promise<void> | null };
  t.mock.method(Date, 'now', () => state.now);
  const simulate = t.mock.method(connection, 'simulateTransaction', async (_tx: Transaction) => {
    if (state.gate) await state.gate;
    if (state.fail) throw new Error('RPC unavailable');
    return { context: { slot: 1 }, value: { err: null, logs: state.logs } };
  });
  const run = (getters = overviewGetters, address = pair) =>
    simulatePairGetters(program, connection, address, rateModel, getters);
  return { program, connection, pair, rateModel, state, simulate, run };
}

test('pool getters use one simulation with three read-only instructions and parse distinct results', async (t) => {
  const { program, simulate, run } = overviewFixture(t);
  const results = await run();
  assert.deepEqual(results, [
    { label: 'emaPrice0Nad', value0: '123456789', value1: '0', value2: '0' },
    { label: 'emaPrice1Nad', value0: '9876543210', value1: '0', value2: '0' },
    { label: 'getRates', value0: '10000000', value1: '20000000', value2: '0' },
  ]);
  assert.equal(simulate.mock.callCount(), 1);
  const tx = simulate.mock.calls[0].arguments[0];
  assert.ok(tx instanceof Transaction);
  const instructionCoder = new BorshInstructionCoder(program.idl);
  assert.equal(tx.instructions.length, 4);
  assert.deepEqual(tx.instructions[0], ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }));
  assert.deepEqual(tx.instructions.slice(1).map((ix) => {
    assert.ok(ix.programId.equals(program.programId));
    assert.ok(ix.keys.every((key) => !key.isWritable && !key.isSigner));
    return (instructionCoder.decode(ix.data)!.data as { getter: GetterType }).getter;
  }), overviewGetters);
  tx.recentBlockhash = PublicKey.default.toBase58();
  assert.ok(tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length <= PACKET_DATA_SIZE);
});

test('single-getter callers retain their result shape alongside combined getters', async (t) => {
  const { program, connection, pair, rateModel, run, simulate } = overviewFixture(t);
  const combined = await run();
  const individual = await Promise.all(overviewGetters.map((getter) =>
    simulatePairGetter(program, connection, pair, rateModel, getter)
  ));
  assert.deepEqual(combined, individual);
  assert.equal(simulate.mock.callCount(), 4);
  await simulatePairGetter(program, connection, pair, rateModel, overviewGetters[0]);
  assert.equal(simulate.mock.callCount(), 4);
});

test('combined simulations deduplicate concurrent reads and expire after five seconds', async (t) => {
  const { state, run, simulate } = overviewFixture(t);
  let release!: () => void;
  state.gate = new Promise<void>((resolve) => { release = resolve; });
  const first = run();
  const second = run();
  await new Promise<void>((resolve) => setImmediate(resolve));
  const callsWhilePending = simulate.mock.callCount();
  release();
  const results = await Promise.all([first, second]);
  assert.equal(callsWhilePending, 1);
  assert.deepEqual(results[0], results[1]);
  state.now += 4_999;
  assert.deepEqual(await run(), results[0]);
  assert.equal(simulate.mock.callCount(), 1);
  state.now++;
  await run();
  assert.equal(simulate.mock.callCount(), 2);
});

test('combined cache distinguishes pools and preserves requested getter order', async (t) => {
  const { run, simulate } = overviewFixture(t);
  const first = await run();
  await run(overviewGetters, new PublicKey(PAIR_B));
  const reversed = await run([...overviewGetters].reverse());
  assert.deepEqual(reversed, [...first].reverse());
  assert.equal(simulate.mock.callCount(), 3);
});

test('missing getter logs fail the whole group without caching partial results', async (t) => {
  const { state, run, simulate } = overviewFixture(t);
  state.logs = overviewLogs.slice(0, 2);
  await assert.rejects(run(), /Tuple values for getRates not found/);
  state.logs = overviewLogs;
  assert.equal((await run()).length, 3);
  assert.equal(simulate.mock.callCount(), 2);
});

test('combined simulations reject transaction errors even when getter logs exist', async (t) => {
  const { run, simulate } = overviewFixture(t);
  simulate.mock.mockImplementationOnce(async () => ({
    context: { slot: 1 },
    value: { err: { InstructionError: [3, 'ComputationalBudgetExceeded'] }, logs: overviewLogs },
  }));
  await assert.rejects(run(), /ComputationalBudgetExceeded/);
  assert.equal((await run()).length, 3);
  assert.equal(simulate.mock.callCount(), 2);
});

test('failed combined RPC calls release in-flight state for retry', async (t) => {
  const { state, run, simulate } = overviewFixture(t);
  state.fail = true;
  await assert.rejects(run(), /RPC unavailable/);
  state.fail = false;
  assert.equal((await run()).length, 3);
  assert.equal(simulate.mock.callCount(), 2);
});

test('an empty getter list needs no simulation', async (t) => {
  const { run, simulate } = overviewFixture(t);
  assert.deepEqual(await run([]), []);
  assert.equal(simulate.mock.callCount(), 0);
});
