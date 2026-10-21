import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database';
import { PositionController } from '../controllers/positionController';
import * as helpers from '../controllers/helpers/controllerBase';
import * as lpMetrics from '../services/lpPositionMetricsService';
import { cache } from '../utils/cache';

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
      getProgram: () => null,
      getConnection: () => ({}),
    }));
    t.mock.method(lpMetrics, 'getLpPositionMetricsForRows', async () => new Map());

    async function request(query: Record<string, string>) {
      let body: any;
      const response = { json: (value: unknown) => { body = value; }, status: () => response };
      await handler({ query } as any, response as any);
      assert.equal(body.success, true);
      return body.data.pagination.total;
    }

    const walletQuery = { userAddress: '11111111111111111111111111111111' };
    assert.equal(await request(walletQuery), 1);
    assert.equal(await request({}), 1);
    total = 2;
    assert.equal(await request(walletQuery), 2);
    assert.equal(await request({}), 1);
  });
}
