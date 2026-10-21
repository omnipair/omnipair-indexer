import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryResult, QueryResultRow } from 'pg';
import {
  getUserLpEarningsForRange,
  getLpPositionMetricKey,
  getLpPositionMetricsForRows,
} from '../services/lpPositionMetricsService';

function mockResult<T extends QueryResultRow = any>(rows: QueryResultRow[]): QueryResult<T> {
  return {
    rows: rows as T[],
    rowCount: rows.length,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

test('LP position metrics expose historical and current USD earnings values', async () => {
  const db = {
    async query<T extends QueryResultRow = any>(text: string): Promise<QueryResult<T>> {
      if (text.includes('FROM lp_position_earnings')) {
        return mockResult<T>([{
          pair: 'pair-a',
          signer: 'user-a',
          accrued_interest0: '1000000',
          accrued_interest1: '0',
          swap_fees0: '0',
          swap_fees1: '2000000',
          accrued_interest_usd: '1',
          swap_fees_usd: '9',
          total_earned_usd: '10',
          accrued_interest_price_quality: 'estimated',
          swap_fees_price_quality: 'historical',
          total_earned_price_quality: 'estimated',
        }]);
      }

      if (text.includes('FROM adjust_liquidity')) {
        return mockResult<T>([{
          pair: 'pair-a',
          signer: 'user-a',
          net_amount0: '1000000',
          net_amount1: '1000000',
        }]);
      }

      return mockResult<T>([]);
    },
  };

  const metrics = await getLpPositionMetricsForRows(
    db,
    [{
      signer: 'user-a',
      pair: 'pair-a',
      token0Mint: 'token-a',
      token1Mint: 'token-b',
      amount0: '3000000',
      amount1: '3000000',
      lpAmount: '100',
    }],
    {
      currentPrices: new Map([
        ['token-a', { priceUsd: 2, decimals: 6, quality: 'current' }],
        ['token-b', { priceUsd: 5, decimals: 6, quality: 'current' }],
      ]),
      currentAmountsByPosition: new Map([[
        getLpPositionMetricKey('user-a', 'pair-a'),
        {
          signer: 'user-a',
          pair: 'pair-a',
          token0Amount: 4_000_000,
          token1Amount: 1_000_000,
          exact: true,
        },
      ]]),
    }
  );

  const positionMetrics = metrics.get(getLpPositionMetricKey('user-a', 'pair-a'));
  assert.equal(positionMetrics?.earnings.totalEarned.usd, '10');
  assert.equal(positionMetrics?.earnings.totalEarned.historicalUsd, '10');
  assert.equal(positionMetrics?.earnings.totalEarned.currentUsd, '12');
  assert.equal(positionMetrics?.earnings.totalEarned.priceQuality, 'estimated');
  assert.equal(positionMetrics?.earnings.totalEarned.currentPriceQuality, 'current');
  assert.equal(positionMetrics?.earnings.totalEarned.priceBasis, 'historical');
  assert.equal(positionMetrics?.valueDelta.currentValue.usd, '13');
  assert.equal(positionMetrics?.valueDelta.currentValue.priceBasis, 'current');
  assert.equal(positionMetrics?.valueDelta.netContributed?.usd, '7');
  assert.equal(positionMetrics?.valueDelta.delta?.usd, '6');
  assert.equal(positionMetrics?.valueDelta.unavailableReason, undefined);
});

test('ranged LP earnings aggregate event-time and current USD values server-side', async () => {
  const now = new Date('2026-05-29T00:00:00Z');
  let observedSql = '';
  let observedParams: any[] | undefined;

  const db = {
    async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
      observedSql = text;
      observedParams = params;
      return mockResult<T>([{
        pair: 'pair-a',
        signer: 'user-a',
        token0_mint: 'token-a',
        token1_mint: 'token-b',
        accrued_interest0: '2000000',
        accrued_interest1: '500000',
        swap_fees0: '1000000',
        swap_fees1: '0',
        accrued_interest_usd: '4',
        swap_fees_usd: '1',
        total_earned_usd: '5',
        accrued_interest_token0_usd: '3',
        accrued_interest_token1_usd: '1',
        swap_fees_token0_usd: '1',
        swap_fees_token1_usd: '0',
        total_earned_token0_usd: '4',
        total_earned_token1_usd: '1',
        accrued_interest_price_quality: 'estimated',
        swap_fees_price_quality: 'historical',
        total_earned_price_quality: 'estimated',
      }]);
    },
  };

  const response = await getUserLpEarningsForRange(db, 'user-a', {
    range: '7d',
    poolAddress: 'pair-a',
    now,
    currentPrices: new Map([
      ['token-a', { priceUsd: 2, decimals: 6, quality: 'current' }],
      ['token-b', { priceUsd: 10, decimals: 6, quality: 'current' }],
    ]),
  });

  assert.equal(response.range, '7D');
  assert.equal(response.from, '2026-05-22T00:00:00.000Z');
  assert.equal(response.to, now.toISOString());
  assert.equal(response.totals.accruedInterest.historicalUsd, '4');
  assert.equal(response.totals.accruedInterest.currentUsd, '9');
  assert.equal(response.totals.swapFees.historicalUsd, '1');
  assert.equal(response.totals.swapFees.currentUsd, '2');
  assert.equal(response.totals.totalEarned.historicalUsd, '5');
  assert.equal(response.totals.totalEarned.currentUsd, '11');
  assert.equal(response.totals.totalEarned.priceQuality, 'estimated');
  assert.equal(response.totals.totalEarned.currentPriceQuality, 'current');
  assert.equal(response.positions[0]?.totalEarned.token0Amount, '3000000');
  assert.equal(response.positions[0]?.totalEarned.token1Amount, '500000');
  assert.equal(response.positions[0]?.totalEarned.usd, '5');
  assert.equal(response.positions[0]?.totalEarned.currentUsd, '11');
  assert.match(observedSql, /lp_position_earning_events/);
  assert.match(observedSql, /event_timestamp >= \$3/);
  assert.deepEqual(observedParams?.slice(0, 2), ['user-a', 'pair-a']);
  assert.equal(observedParams?.[2]?.toISOString(), '2026-05-22T00:00:00.000Z');
  assert.equal(observedParams?.[3], now);
});

test('ranged LP earnings return zero totals when a wallet has no earning events', async () => {
  const db = {
    async query<T extends QueryResultRow = any>(): Promise<QueryResult<T>> {
      return mockResult<T>([]);
    },
  };

  const response = await getUserLpEarningsForRange(db, 'user-a', {
    range: 'unexpected',
    now: new Date('2026-05-29T00:00:00Z'),
    currentPrices: new Map(),
  });

  assert.equal(response.range, '30D');
  assert.deepEqual(response.positions, []);
  assert.equal(response.totals.totalEarned.usd, '0');
  assert.equal(response.totals.totalEarned.historicalUsd, '0');
  assert.equal(response.totals.totalEarned.currentUsd, '0');
  assert.equal(response.totals.totalEarned.priceQuality, 'historical');
  assert.equal(response.totals.totalEarned.currentPriceQuality, 'historical');
});
