import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryResult, QueryResultRow } from 'pg';
import {
  getBorrowRateHistory,
  normalizeBorrowRateHistoryRange,
  rawRateToPct,
} from '../services/borrowRateHistoryService';

function mockResult<T extends QueryResultRow = any>(rows: QueryResultRow[]): QueryResult<T> {
  return {
    rows: rows as T[],
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

function createMockDb() {
  const calls: Array<{ text: string; params?: any[] }> = [];
  const db = {
    async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
      calls.push({ text, params });

      if (text.includes('FROM update_pair_events')) {
        return mockResult<T>([
          {
            rate0: '1712345678',
            rate1: '2154200000',
            timestamp: new Date('2026-06-08T09:05:00Z'),
            slot: '123456',
            transaction_signature: 'tx-a',
          },
          {
            rate0: '1800000000',
            rate1: '1080000000',
            timestamp: new Date('2026-06-08T09:10:00Z'),
            slot: '123500',
            transaction_signature: 'tx-b',
          },
        ]);
      }

      if (text.includes('FROM pools')) {
        return mockResult<T>([
          {
            target_util_start_bps: '3000',
            target_util_end_bps: '5000',
            rate_half_life_ms: '259200000',
            min_rate_bps: '100',
            max_rate_bps: '0',
          },
        ]);
      }

      return mockResult<T>([]);
    },
  };

  return { db, calls };
}

test('normalizes borrow rate history ranges including 30D', () => {
  assert.deepEqual(normalizeBorrowRateHistoryRange(undefined), {
    range: '24H',
    windowHours: 24,
    bucketSeconds: 300,
  });
  assert.deepEqual(normalizeBorrowRateHistoryRange('30d'), {
    range: '30D',
    windowHours: 720,
    bucketSeconds: 14400,
  });
  assert.throws(() => normalizeBorrowRateHistoryRange('90D'), /Unsupported range/);
});

test('converts raw NAD-scaled borrow rates to percentage values', () => {
  assert.equal(rawRateToPct('10000000'), 1);
  assert.equal(rawRateToPct('2154200000'), 215.42);
  assert.equal(rawRateToPct(null), 0);
});

test('rate history returns mapped points and current controller params', async () => {
  const { db } = createMockDb();
  const result = await getBorrowRateHistory(db, 'pair-a', {
    range: '24H',
    now: new Date('2026-06-08T10:00:00Z'),
  });

  assert.equal(result.pairAddress, 'pair-a');
  assert.equal(result.range, '24H');
  assert.equal(result.bucketSeconds, 300);
  assert.equal(result.points.length, 2);
  assert.equal(result.points[0].timestamp, '2026-06-08T09:05:00.000Z');
  assert.equal(result.points[0].slot, '123456');
  assert.equal(result.points[0].transactionSignature, 'tx-a');
  assert.equal(result.points[0].token0RatePct, 171.2345678);
  assert.equal(result.points[0].token1RatePct, 215.42);
  assert.deepEqual(result.controller, {
    targetUtilStartPct: 30,
    targetUtilEndPct: 50,
    halfLifeMs: 259200000,
    minRatePct: 1,
    maxRatePct: null,
    initialRatePct: null,
  });
});

test('rate history query down-samples to latest event per bucket', async () => {
  const { db, calls } = createMockDb();
  await getBorrowRateHistory(db, 'pair-a', {
    range: '7D',
    now: new Date('2026-06-08T10:00:00Z'),
  });

  const historyCall = calls.find((call) => call.text.includes('FROM update_pair_events'));
  assert.ok(historyCall);
  assert.equal(historyCall?.params?.[2], 3600);
  assert.equal(historyCall?.text.includes('PARTITION BY bucket'), true);
  assert.equal(historyCall?.text.includes('ORDER BY "timestamp" DESC, slot DESC'), true);
});

test('empty rate history returns an empty points array', async () => {
  const db = {
    async query<T extends QueryResultRow = any>(text: string): Promise<QueryResult<T>> {
      if (text.includes('FROM pools')) {
        return mockResult<T>([]);
      }
      return mockResult<T>([]);
    },
  };

  const result = await getBorrowRateHistory(db, 'pair-a', {
    range: '1H',
    now: new Date('2026-06-08T10:00:00Z'),
  });

  assert.deepEqual(result.points, []);
  assert.equal(result.controller, null);
});
