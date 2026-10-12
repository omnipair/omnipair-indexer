import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey, Connection } from '@solana/web3.js';
import { AccountLayout, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { fetchWalletLpBalances } from '../services/walletLpBalanceService';

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
  assert.deepEqual(result.map((position) => position.lpAmount), ['9007199254741000', '42']);
  assert.equal(result[0].token0Mint, 'token0');
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('zero balances produce no holdings and need no database query', async () => {
  const connection = { getTokenAccountsByOwner: async () => ({ context: { slot: 1 }, value: [] }) };
  const db = { query: async () => { throw new Error('Unexpected query'); } };
  assert.deepEqual(await fetchWalletLpBalances(owner.toBase58(), db as any, connection), []);
});

test('a failed token-program lookup cannot produce a partial wallet balance', async () => {
  const connection = { getTokenAccountsByOwner: async () => { throw new Error('RPC unavailable'); } };
  await assert.rejects(fetchWalletLpBalances(owner.toBase58(), {} as any, connection), /RPC unavailable/);
});
