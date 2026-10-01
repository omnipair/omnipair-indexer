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

test('pool USD totals match the webapp with unequal mint decimals', () => {
  assert.deepEqual(calculatePoolValuation(pool, prices), { tvl_usd: 80, total_debt_usd: 8 });
});

test('an unpriced nonzero leg makes the total unavailable without doubling the priced side', () => {
  assert.deepEqual(calculatePoolValuation(pool, new Map([['a', prices.get('a')!]])), {
    tvl_usd: null, total_debt_usd: null,
  });
});

test('zero balances need no prices and debt availability is independent of TVL', () => {
  assert.deepEqual(calculatePoolValuation({ ...pool, total_debts: { token0: '0', token1: '0' } }, new Map()), {
    tvl_usd: null, total_debt_usd: 0,
  });
  assert.deepEqual(calculatePoolValuation({
    ...pool, reserves: { token0: '10', token1: '0' }, total_debts: { token0: '0', token1: '0' },
  }, new Map([['a', prices.get('a')!]])), { tvl_usd: 20, total_debt_usd: 0 });
});

test('invalid amounts, invalid prices, and overflow cannot become valid USD totals', () => {
  for (const price of [0, -1, NaN, Infinity]) {
    assert.equal(calculatePoolValuation(pool, new Map([...prices, ['a', { price, decimals: 9 }]])).tvl_usd, null);
  }
  for (const amount of ['bad', '-1', 'Infinity', '1e308']) {
    assert.equal(calculatePoolValuation({ ...pool, reserves: { token0: amount, token1: '20' } }, prices).tvl_usd, null);
  }
});
