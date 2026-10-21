import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePoolValuation } from '../services/poolValuation';

const pool = {
  token0: { address: 'a', decimals: 9 },
  token1: { address: 'b', decimals: 6 },
  reserves: { token0: '10', token1: '20' },
  total_debts: { token0: '1000000000', token1: '2000000' },
};
const prices = new Map([
  ['a', { price: 2, decimals: 9 }],
  ['b', { price: 3, decimals: 6 }],
]);

test('pool USD prices, breakdowns, and totals use the same quotes with unequal mint decimals', () => {
  assert.deepEqual(calculatePoolValuation(pool, prices), {
    token_prices_usd: { token0: 2, token1: 3 },
    reserves_usd: { token0: 20, token1: 60 },
    total_debts_usd: { token0: 2, token1: 6 },
    tvl_usd: 80, total_debt_usd: 8,
  });
});

test('an unpriced nonzero leg makes the total unavailable without doubling the priced side', () => {
  assert.deepEqual(calculatePoolValuation(pool, new Map([['a', prices.get('a')!]])), {
    token_prices_usd: { token0: 2, token1: null },
    reserves_usd: { token0: 20, token1: null },
    total_debts_usd: { token0: 2, token1: null },
    tvl_usd: null, total_debt_usd: null,
  });
});

test('zero balances need no prices and debt availability is independent of TVL', () => {
  assert.deepEqual(calculatePoolValuation({ ...pool, total_debts: { token0: '0', token1: '0' } }, new Map()), {
    token_prices_usd: { token0: null, token1: null },
    reserves_usd: { token0: null, token1: null },
    total_debts_usd: { token0: 0, token1: 0 },
    tvl_usd: null, total_debt_usd: 0,
  });
  assert.deepEqual(calculatePoolValuation({
    ...pool, reserves: { token0: '10', token1: '0' }, total_debts: { token0: '0', token1: '0' },
  }, new Map([['a', prices.get('a')!]])), {
    token_prices_usd: { token0: 2, token1: null },
    reserves_usd: { token0: 20, token1: 0 },
    total_debts_usd: { token0: 0, token1: 0 },
    tvl_usd: 20, total_debt_usd: 0,
  });
});

test('invalid amounts, invalid prices, and overflow cannot become valid USD totals', () => {
  for (const price of [0, -1, NaN, Infinity]) {
    assert.deepEqual(calculatePoolValuation(pool, new Map([...prices, ['a', { price, decimals: 9 }]])), {
      token_prices_usd: { token0: null, token1: 3 },
      reserves_usd: { token0: null, token1: 60 },
      total_debts_usd: { token0: null, token1: 6 },
      tvl_usd: null, total_debt_usd: null,
    });
  }
  for (const amount of ['bad', '-1', 'Infinity', '1e308']) {
    const valuation = calculatePoolValuation({ ...pool, reserves: { token0: amount, token1: '20' } }, prices);
    assert.deepEqual(valuation.reserves_usd, { token0: null, token1: 60 });
    assert.equal(valuation.tvl_usd, null);
  }
});

test('debt valuation uses the mint decimals, including zero, rather than price-provider decimals', () => {
  const valuation = calculatePoolValuation({
    ...pool,
    token0: { ...pool.token0, decimals: 0 },
    total_debts: { token0: '5', token1: '2500000' },
  }, prices);
  assert.deepEqual(valuation.total_debts_usd, { token0: 10, token1: 7.5 });
  assert.equal(valuation.total_debt_usd, 17.5);
});
