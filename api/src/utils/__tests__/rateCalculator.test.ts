import { describe, expect, it } from 'bun:test';
import { calculateInterestRate, RateModelAccountData, RATE_PERCENT_SCALE } from '../rateCalculator';

const NAD = 1_000_000_000;
const HALF_LIFE_SECONDS = 3600; // 1 hour
const EXP_RATE = BigInt(
  Math.round((Math.log(2) / HALF_LIFE_SECONDS) * NAD)
);
const TARGET_START = BigInt(Math.round(0.33 * NAD));
const TARGET_END = BigInt(Math.round(0.66 * NAD));

const baseRateModel: RateModelAccountData = {
  expRate: EXP_RATE,
  targetUtilStart: TARGET_START,
  targetUtilEnd: TARGET_END,
};

describe('calculateInterestRate', () => {
  it('keeps the rate unchanged inside the utilization band', () => {
    const result = calculateInterestRate(
      {
        utilizationPercent: 50,
        lastRate: BigInt(500_000_000),
        lastUpdateTimestamp: 0,
        currentTimestamp: HALF_LIFE_SECONDS,
      },
      baseRateModel
    );

    expect(result.rawRate).toBeCloseTo(500_000_000);
  });

  it('decays exponentially when utilization falls below the band', () => {
    const lastRate = BigInt(800_000_000);
    const result = calculateInterestRate(
      {
        utilizationPercent: 5,
        lastRate,
        lastUpdateTimestamp: 0,
        currentTimestamp: HALF_LIFE_SECONDS,
      },
      baseRateModel
    );

    const expected = Number(lastRate) / 2;
    expect(Math.abs(result.rawRate - expected)).toBeLessThan(expected * 1e-6);
  });

  it('grows exponentially when utilization is above the band', () => {
    const lastRate = BigInt(200_000_000);
    const result = calculateInterestRate(
      {
        utilizationPercent: 90,
        lastRate,
        lastUpdateTimestamp: 0,
        currentTimestamp: HALF_LIFE_SECONDS,
      },
      baseRateModel
    );

    const expected = Number(lastRate) * 2;
    expect(Math.abs(result.rawRate - expected)).toBeLessThan(expected * 1e-6);
  });

  it('ignores time deltas that are zero or negative', () => {
    const lastRate = BigInt(350_000_000);
    const result = calculateInterestRate(
      {
        utilizationPercent: 10,
        lastRate,
        lastUpdateTimestamp: 1_000,
        currentTimestamp: 900, // negative delta
      },
      baseRateModel
    );

    expect(result.rawRate).toBeCloseTo(Number(lastRate));
  });

  it('handles zero last rate without producing NaN', () => {
    const result = calculateInterestRate(
      {
        utilizationPercent: 90,
        lastRate: BigInt(0),
        lastUpdateTimestamp: 0,
        currentTimestamp: HALF_LIFE_SECONDS,
      },
      baseRateModel
    );

    expect(result.rawRate).toBe(0);
  });

  it('clamps utilization percentages outside the 0-100 range', () => {
    const lastRate = BigInt(600_000_000);
    const result = calculateInterestRate(
      {
        utilizationPercent: 150, // treated as > targetEnd
        lastRate,
        lastUpdateTimestamp: 0,
        currentTimestamp: HALF_LIFE_SECONDS,
      },
      baseRateModel
    );

    expect(result.rawRate).toBeGreaterThan(Number(lastRate));
  });

  it('returns aprPercent scaled from the raw rate', () => {
    const lastRate = BigInt(123_000_000);
    const result = calculateInterestRate(
      {
        utilizationPercent: 50,
        lastRate,
        lastUpdateTimestamp: 0,
        currentTimestamp: 10,
      },
      baseRateModel
    );

    expect(result.aprPercent).toBeCloseTo(
      Number(lastRate) / RATE_PERCENT_SCALE
    );
  });
});
