import test from 'node:test';
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import pool from '../config/database';
import { PositionController } from '../controllers/positionController';
import * as helpers from '../controllers/helpers/controllerBase';
import * as lpMetrics from '../services/lpPositionMetricsService';
import * as balances from '../services/walletLpBalanceService';
import * as simulation from '../utils/pairSimulation';
import { cache } from '../utils/cache';

const key = (value: number) => new PublicKey(new Uint8Array(32).fill(value));

for (const handler of [PositionController.getAllPositions, PositionController.getAllLiquidityPositions]) {
  test(`${handler.name} refetches wallet data in the same millisecond and keeps aggregate caching`, async (t) => {
    cache.clear();
    t.after(() => cache.clear());
    t.mock.method(Date, 'now', () => 1000);
    let total = 1;
    t.mock.method(pool, 'query', async (sql: string) => ({
      rows: sql.includes('COUNT(*)') ? [{ total_count: String(total) }] : [],
    }));
    t.mock.method(helpers, 'initializePairStateService', async () => ({
      getProgram: () => ({}),
      getConnection: () => ({}),
    }));
    t.mock.method(lpMetrics, 'getLpPositionMetricsForRows', async () => new Map());
    const walletLookup = t.mock.method(balances, 'fetchWalletLpBalances', async () => ({
      holdings: Array.from({ length: total }, (_, index) => ({
        pair: key(index + 1).toBase58(), lpMint: key(8).toBase58(),
        token0Mint: key(9).toBase58(), token1Mint: key(10).toBase58(), lpAmount: '1',
      })),
      observation: {
        commitment: 'confirmed', observedAt: new Date().toISOString(), slotsByTokenProgram: {},
      },
    }));
    t.mock.method(simulation, 'fetchPairAccounts', async (_program: unknown, pairs: string[]) => new Map(
      pairs.map((pair) => [pair, {
        lpMint: key(8), token0: key(9), token1: key(10),
        totalSupply: 100n, reserve0: 1000n, reserve1: 2000n,
      }])
    ));

    async function request(query: Record<string, string>) {
      let body: any;
      const response = {
        setHeader: () => {},
        json: (value: unknown) => { body = value; },
        status: () => response,
      };
      await handler({ query } as any, response as any);
      assert.equal(body.success, true);
      return body.data.pagination.total;
    }

    const walletQuery = { userAddress: PublicKey.default.toBase58() };
    assert.equal(await request(walletQuery), 1);
    assert.equal(await request({}), 1);
    total = 2;
    assert.equal(await request(walletQuery), 2);
    assert.equal(await request({}), 1);
    assert.equal(walletLookup.mock.callCount(), handler === PositionController.getAllLiquidityPositions ? 2 : 0);
  });
}
