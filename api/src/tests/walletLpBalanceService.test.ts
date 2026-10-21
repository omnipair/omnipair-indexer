import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, Connection } from '@solana/web3.js';
import { AccountLayout, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { fetchWalletLpBalances, LiveLpDataUnavailableError } from '../services/walletLpBalanceService';
import * as programConfig from '../config/program';

const key = (value: number) => new PublicKey(new Uint8Array(32).fill(value));
const owner = key(1);
const lpMint = key(2);
const extensionLpMint = key(3);

function tokenAccount(address: number, mint: PublicKey, amount: bigint, program = TOKEN_PROGRAM_ID) {
  const data = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode({
    mint, owner, amount, delegateOption: 0, delegate: PublicKey.default,
    state: 1, isNativeOption: 0, isNative: 0n, delegatedAmount: 0n,
    closeAuthorityOption: 0, closeAuthority: PublicKey.default,
  }, data);
  return {
    pubkey: key(address),
    account: { data, owner: program, lamports: 1, executable: false, rentEpoch: 0 },
  };
}

test('discovers both token programs, sums every account exactly, and matches only LP mints', async () => {
  const requests: string[] = [];
  const connection: Pick<Connection, 'getTokenAccountsByOwner'> = {
    async getTokenAccountsByOwner(wallet, filter, commitment) {
      assert.equal(wallet.toBase58(), owner.toBase58());
      assert.equal(commitment, 'confirmed');
      assert.ok('programId' in filter);
      requests.push(filter.programId.toBase58());
      return {
        context: { slot: 123 },
        value: filter.programId.equals(TOKEN_PROGRAM_ID)
          ? [tokenAccount(10, lpMint, 9007199254740993n), tokenAccount(11, lpMint, 7n),
            tokenAccount(12, key(4), 99n), tokenAccount(13, key(5), 0n)]
          : [tokenAccount(14, extensionLpMint, 42n, TOKEN_2022_PROGRAM_ID)],
      };
    },
  };
  const db = {
    query: async (sql: string, params: unknown[]) => {
      assert.match(sql, /FROM pools WHERE lp_mint/);
      assert.deepEqual(params, [[lpMint.toBase58(), key(4).toBase58(), extensionLpMint.toBase58()]]);
      return { rows: [lpMint, extensionLpMint].map((mint, index) => ({
        pair_address: `pair-${index}`, lp_mint: mint.toBase58(), token0: 'token0', token1: 'token1',
      })) };
    },
  };
  const result = await fetchWalletLpBalances(owner.toBase58(), db as any, connection);
  assert.deepEqual(requests, [TOKEN_PROGRAM_ID.toBase58(), TOKEN_2022_PROGRAM_ID.toBase58()]);
  assert.deepEqual(result.holdings.map((position) => position.lpAmount), ['9007199254741000', '42']);
  assert.equal(result.holdings[0].token0Mint, 'token0');
  assert.equal(result.observation.commitment, 'confirmed');
  assert.deepEqual(result.observation.slotsByTokenProgram, {
    [TOKEN_PROGRAM_ID.toBase58()]: 123, [TOKEN_2022_PROGRAM_ID.toBase58()]: 123,
  });
  assert.ok(Number.isFinite(Date.parse(result.observation.observedAt)));
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('zero balances produce no holdings and need no database query', async () => {
  const connection = { getTokenAccountsByOwner: async () => ({ context: { slot: 1 }, value: [] }) };
  const db = { query: async () => { throw new Error('Unexpected query'); } };
  const result = await fetchWalletLpBalances(owner.toBase58(), db as any, connection);
  assert.deepEqual(result.holdings, []);
  assert.equal(result.observation.slotsByTokenProgram[TOKEN_PROGRAM_ID.toBase58()], 1);
});

test('a failed token-program lookup cannot produce a partial wallet balance', async () => {
  const connection = { getTokenAccountsByOwner: async () => { throw new Error('RPC unavailable'); } };
  await assert.rejects(fetchWalletLpBalances(owner.toBase58(), {} as any, connection), LiveLpDataUnavailableError);
});

test('concurrent wallet lookups share requests, while the next lookup reads new balances', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  let amount = 100n;
  const connection: Pick<Connection, 'getTokenAccountsByOwner'> = {
    async getTokenAccountsByOwner(_owner, filter) {
      calls++;
      await wait;
      assert.ok('programId' in filter);
      return {
        context: { slot: calls },
        value: filter.programId.equals(TOKEN_PROGRAM_ID) ? [tokenAccount(10, lpMint, amount)] : [],
      };
    },
  };
  const db = { query: async () => ({ rows: [{ pair_address: 'pair', lp_mint: lpMint.toBase58(), token0: 'a', token1: 'b' }] }) };
  const first = fetchWalletLpBalances(owner.toBase58(), db as any, connection);
  const concurrent = fetchWalletLpBalances(owner.toBase58(), db as any, connection);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const callsWhilePending = calls;
  release();
  const results = await Promise.all([first, concurrent]);
  assert.equal(callsWhilePending, 2);
  assert.equal(results[0], results[1]);
  assert.equal(results[0].holdings[0].lpAmount, '100');
  amount = 60n;
  assert.equal((await fetchWalletLpBalances(owner.toBase58(), db as any, connection)).holdings[0].lpAmount, '60');
  assert.equal(calls, 4);
});

test('a failed lookup is released so a subsequent request can recover', async () => {
  let failing = true;
  const connection = { getTokenAccountsByOwner: async () => {
    if (failing) throw new Error('RPC unavailable');
    return { context: { slot: 2 }, value: [] };
  } };
  await assert.rejects(fetchWalletLpBalances(owner.toBase58(), {} as any, connection), LiveLpDataUnavailableError);
  failing = false;
  assert.deepEqual((await fetchWalletLpBalances(owner.toBase58(), {} as any, connection)).holdings, []);
});

test('balance reads distinguish temporary RPC failures from malformed token-account data', async () => {
  const rpcFailure = { getTokenAccountsByOwner: async () => {
    throw new Error('429 Too Many Requests: temporarily rate limited');
  } };
  await assert.rejects(fetchWalletLpBalances(owner.toBase58(), {} as any, rpcFailure), (error: unknown) => {
    assert.ok(error instanceof LiveLpDataUnavailableError);
    assert.equal(error.retryable, true);
    return true;
  });

  const malformedAccount = tokenAccount(10, lpMint, 10n);
  malformedAccount.account.data = Buffer.alloc(1);
  const invalidData: Pick<Connection, 'getTokenAccountsByOwner'> = {
    async getTokenAccountsByOwner(_owner, filter) {
      assert.ok('programId' in filter);
      return { context: { slot: 2 }, value: filter.programId.equals(TOKEN_PROGRAM_ID) ? [malformedAccount] : [] };
    },
  };
  await assert.rejects(fetchWalletLpBalances(owner.toBase58(), {} as any, invalidData), (error: unknown) => {
    assert.ok(error instanceof LiveLpDataUnavailableError);
    assert.equal(error.retryable, false);
    return true;
  });
});

test('moving tokens between accounts owned by the same wallet preserves total holdings', async () => {
  let split = false;
  const connection: Pick<Connection, 'getTokenAccountsByOwner'> = {
    async getTokenAccountsByOwner(_owner, filter) {
      assert.ok('programId' in filter);
      return { context: { slot: 2 }, value: filter.programId.equals(TOKEN_PROGRAM_ID)
        ? [tokenAccount(10, lpMint, split ? 60n : 100n), tokenAccount(11, lpMint, split ? 40n : 0n)] : [] };
    },
  };
  const db = { query: async () => ({ rows: [{ pair_address: 'pair', lp_mint: lpMint.toBase58(), token0: 'a', token1: 'b' }] }) };
  const before = await fetchWalletLpBalances(owner.toBase58(), db as any, connection);
  split = true;
  const after = await fetchWalletLpBalances(owner.toBase58(), db as any, connection);
  assert.deepEqual(before.holdings, after.holdings);
});

test('the default connection is lazy, skipped for coalesced reads, and reused across wallets', async (t) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const injected = { getTokenAccountsByOwner: async () => {
    await pending;
    return { context: { slot: 1 }, value: [] };
  } };
  let rpcCalls = 0;
  const shared = { getTokenAccountsByOwner: async () => {
    rpcCalls++;
    return { context: { slot: 2 }, value: [] };
  } };
  const create = t.mock.method(programConfig, 'createConnection', () => shared as unknown as Connection);
  const db = { query: async () => { throw new Error('Unexpected query'); } };

  const first = fetchWalletLpBalances(owner.toBase58(), db as any, injected);
  const coalesced = fetchWalletLpBalances(owner.toBase58(), db as any);
  assert.equal(create.mock.callCount(), 0);
  release();
  await Promise.all([first, coalesced]);

  await fetchWalletLpBalances(owner.toBase58(), db as any);
  await fetchWalletLpBalances(key(6).toBase58(), db as any);
  assert.equal(create.mock.callCount(), 1);
  assert.equal(rpcCalls, 4);
});
