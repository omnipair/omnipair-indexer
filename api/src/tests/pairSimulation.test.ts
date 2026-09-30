import test from 'node:test';
import assert from 'node:assert/strict';
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import type { Omnipair } from '@omnipair/program-interface';
import { fetchPairAccounts, simulateUserPositionGetter } from '../utils/pairSimulation';

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
