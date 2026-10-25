import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRawLpTokenAmounts } from '../services/currentLpValuationService';

test('LP valuation preserves raw units above Number.MAX_SAFE_INTEGER', () => {
  assert.deepEqual(calculateRawLpTokenAmounts(
    '9007199254740993', '9007199254740993', '9007199254740997', '18446744073709551615'
  ), { token0Amount: '9007199254740997', token1Amount: '18446744073709551615' });
});

test('fractional LP claims round down to whole raw units', () => {
  assert.deepEqual(calculateRawLpTokenAmounts('1', '3', '10', '20'), {
    token0Amount: '3', token1Amount: '6',
  });
});

test('invalid pool state cannot be valued as a zero position', () => {
  assert.throws(() => calculateRawLpTokenAmounts('10', '0', '10', '20'), /Invalid/);
  assert.throws(() => calculateRawLpTokenAmounts('10', '100', '-1', '20'), /Invalid/);
});
