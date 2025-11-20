import { PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

const NAD_SCALE = 1_000_000_000;
export const RATE_PERCENT_SCALE = 1e7;
const MAX_EXPONENT = 709; // Safe bound before Math.exp overflows double precision

type NumericLike = number | bigint | { toString(): string };

export interface RateModelAccountData {
  expRate: NumericLike;
  targetUtilStart: NumericLike;
  targetUtilEnd: NumericLike;
}

export interface RateCalculationContext {
  utilizationPercent: number;
  lastRate: NumericLike;
  lastUpdateTimestamp: NumericLike;
  currentTimestamp?: number;
}

export interface RateCalculationResult {
  rawRate: number;
  aprPercent: number;
}

function toNumber(value: NumericLike | undefined | null): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof (value as any).toString === 'function') {
    const parsed = Number((value as any).toString());
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function clamp(value: number, minValue: number, maxValue: number): number {
  if (!Number.isFinite(value)) {
    return minValue;
  }
  return Math.min(Math.max(value, minValue), maxValue);
}

/**
 * Replicates the on-chain interest rate model by applying the same
 * exponential growth/decay that the program executes inside view_pair_data.
 *
 * The rate changes only when utilization exits the [targetUtilStart, targetUtilEnd]
 * band. When below the band the rate decays (halves over the configured half-life),
 * and when above it grows (doubles over the same window). Within the band the rate
 * remains unchanged.
 */
export function calculateInterestRate(
  context: RateCalculationContext,
  rateModel: RateModelAccountData
): RateCalculationResult {
  const utilizationPercent = clamp(context.utilizationPercent ?? 0, 0, 100);
  const utilizationNad = (utilizationPercent / 100) * NAD_SCALE;
  const targetStartRaw = toNumber(rateModel.targetUtilStart);
  const targetEndRaw = toNumber(rateModel.targetUtilEnd);
  const expRateRaw = Math.max(0, toNumber(rateModel.expRate));
  const lastRate = Math.max(0, toNumber(context.lastRate));
  const lastUpdate = Math.floor(toNumber(context.lastUpdateTimestamp));
  const currentTimestamp =
    context.currentTimestamp ?? Math.floor(Date.now() / 1000);
  const deltaSeconds = Math.max(0, currentTimestamp - lastUpdate);

  const lowerBound = Math.min(targetStartRaw, targetEndRaw);
  const upperBound = Math.max(targetStartRaw, targetEndRaw);
  let direction = 0;
  if (utilizationNad < lowerBound) {
    direction = -1;
  } else if (utilizationNad > upperBound) {
    direction = 1;
  }

  let updatedRate = lastRate;
  if (
    direction !== 0 &&
    deltaSeconds > 0 &&
    expRateRaw > 0 &&
    lastRate > 0
  ) {
    const kReal = expRateRaw / NAD_SCALE;
    const exponent = clamp(direction * kReal * deltaSeconds, -MAX_EXPONENT, MAX_EXPONENT);
    const growthFactor = Math.exp(exponent);
    if (Number.isFinite(growthFactor)) {
      updatedRate = lastRate * growthFactor;
    }
  }

  const sanitizedRate = Math.max(0, Number.isFinite(updatedRate) ? updatedRate : 0);
  return {
    rawRate: sanitizedRate,
    aprPercent: sanitizedRate / RATE_PERCENT_SCALE,
  };
}

export interface PairRateContext {
  utilization0: number;
  utilization1: number;
  lastRate0: NumericLike;
  lastRate1: NumericLike;
  lastUpdate: NumericLike;
  currentTimestamp?: number;
}

/**
 * Fetch rate model account and calculate the current rates for both tokens.
 */
export async function fetchRatesFromRateModel(
  program: Program,
  rateModelPubkey: PublicKey,
  context: PairRateContext
): Promise<{ rate0: number; rate1: number }> {
  try {
    const rateModel = await (program.account as any).rateModel.fetch(
      rateModelPubkey
    );

    const timestamp =
      context.currentTimestamp ?? Math.floor(Date.now() / 1000);
    const rate0Result = calculateInterestRate(
      {
        utilizationPercent: context.utilization0,
        lastRate: context.lastRate0,
        lastUpdateTimestamp: context.lastUpdate,
        currentTimestamp: timestamp,
      },
      {
        expRate: rateModel.expRate,
        targetUtilStart: rateModel.targetUtilStart,
        targetUtilEnd: rateModel.targetUtilEnd,
      }
    );
    const rate1Result = calculateInterestRate(
      {
        utilizationPercent: context.utilization1,
        lastRate: context.lastRate1,
        lastUpdateTimestamp: context.lastUpdate,
        currentTimestamp: timestamp,
      },
      {
        expRate: rateModel.expRate,
        targetUtilStart: rateModel.targetUtilStart,
        targetUtilEnd: rateModel.targetUtilEnd,
      }
    );

    return { rate0: rate0Result.rawRate, rate1: rate1Result.rawRate };
  } catch (error) {
    console.error('Error fetching rate model:', error);
    return { rate0: 0, rate1: 0 };
  }
}

