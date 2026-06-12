import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMarketActivityQuery,
  mapMarketActivityRows,
  parseMarketActivityCategories,
  parseMarketActivitySort,
} from '../controllers/marketActivityController';

test('parseMarketActivityCategories preserves known deterministic order', () => {
  assert.deepEqual(parseMarketActivityCategories('lending,liquidity'), ['liquidity', 'lending']);
  assert.deepEqual(parseMarketActivityCategories('unknown'), ['swaps', 'liquidity', 'lending']);
  assert.deepEqual(parseMarketActivityCategories(), ['swaps', 'liquidity', 'lending']);
});

test('parseMarketActivitySort defaults to recent unless oldest is requested', () => {
  assert.equal(parseMarketActivitySort('oldest'), 'oldest');
  assert.equal(parseMarketActivitySort('recent'), 'recent');
  assert.equal(parseMarketActivitySort('anything'), 'recent');
});

test('buildMarketActivityQuery filters liquidity by pair only', () => {
  const built = buildMarketActivityQuery({
    categories: ['liquidity'],
    limit: 50,
    offset: 100,
    poolAddress: 'pair-1',
    sort: 'recent',
  });

  assert.deepEqual(built.params, ['pair-1', 51, 100]);
  assert.match(built.query, /FROM adjust_liquidity al/);
  assert.match(built.query, /WHERE al\.pair = \$1/);
  assert.doesNotMatch(built.query, /WHERE al\.user_address/);
  assert.match(built.query, /ORDER BY ce\.event_timestamp DESC/);
});

test('buildMarketActivityQuery filters lending by pair and excludes position updates', () => {
  const built = buildMarketActivityQuery({
    categories: ['lending'],
    limit: 25,
    offset: 0,
    poolAddress: 'pair-2',
    sort: 'oldest',
  });

  assert.deepEqual(built.params, ['pair-2', 26, 0]);
  assert.match(built.query, /FROM adjust_collateral_events ace/);
  assert.match(built.query, /FROM adjust_debt_events ade/);
  assert.match(built.query, /FROM user_position_liquidated_events uple/);
  assert.match(built.query, /WHERE ace\.pair = \$1/);
  assert.match(built.query, /WHERE ade\.pair = \$1/);
  assert.match(built.query, /WHERE uple\.pair = \$1/);
  assert.doesNotMatch(built.query, /user_position_updated_events/);
  assert.doesNotMatch(built.query, /\.signer = \$1/);
  assert.match(built.query, /ORDER BY ce\.event_timestamp ASC/);
});

test('mapMarketActivityRows keeps actor and pair metadata', () => {
  const [item] = mapMarketActivityRows([
    {
      activity_type: 'lending',
      actor: 'wallet-1',
      amount0: '100',
      amount1: null,
      amount_in: null,
      amount_out: null,
      collateral0: null,
      collateral1: null,
      collateral0_liquidated: null,
      collateral1_liquidated: null,
      collateral_price: null,
      debt0_liquidated: null,
      debt1_liquidated: null,
      debt0_shares: null,
      debt1_shares: null,
      event_id: 'debt_adjustment:7',
      event_timestamp: '2026-06-01T00:00:00.000Z',
      is_token0_in: null,
      lending_event_type: 'debt_adjustment',
      liquidator: null,
      liquidity: null,
      liquidity_event_type: null,
      pair: 'pair-1',
      position: null,
      slot: '123',
      token0: 'token-a',
      token1: 'token-b',
      tx_signature: 'sig-1',
    },
  ]);

  assert.equal(item.type, 'lending');
  assert.deepEqual(item.pair, {
    address: 'pair-1',
    token0: 'token-a',
    token1: 'token-b',
  });
  assert.equal(item.details.actor, 'wallet-1');
  assert.equal(item.details.eventId, 'debt_adjustment:7');
});
