import { PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';

/**
 * TODO: This is a simplified version of the rate calculation logic.
 * TODO: Need to implement the actual rate calculation logic.
 * Calculate interest rate based on utilization and rate model
 * This replicates the on-chain rate calculation logic
 */
export function calculateInterestRate(
  utilization: number, // 0-100%
  rateModel: {
    expRate: bigint;
    targetUtilStart: bigint;
    targetUtilEnd: bigint;
  }
): number {
  // NAD constant (1e9)
  const NAD = 1e9;
  
  // Convert utilization percentage to NAD scale (0-NAD)
  const utilizationNad = (utilization / 100) * NAD;
  
  // Get rate model parameters
  const expRate = Number(rateModel.expRate);
  const targetUtilStart = Number(rateModel.targetUtilStart);
  const targetUtilEnd = Number(rateModel.targetUtilEnd);
  
  // Calculate base rate from exponential rate
  // This is a simplified version - adjust based on your actual rate model logic
  const k_real = expRate / NAD;
  
  // Calculate rate based on utilization bands
  let rate: number;
  
  if (utilizationNad < targetUtilStart) {
    // Below target range - lower rate
    const utilizationFactor = utilizationNad / targetUtilStart;
    rate = k_real * utilizationFactor;
  } else if (utilizationNad > targetUtilEnd) {
    // Above target range - higher rate (exponential increase)
    const excessUtil = (utilizationNad - targetUtilEnd) / (NAD - targetUtilEnd);
    rate = k_real * (1 + excessUtil * 10); // Exponential factor
  } else {
    // Within target range - stable rate
    rate = k_real;
  }
  
  // Convert to percentage (rate is already in decimal form)
  return rate * 100;
}

/**
 * Fetch rate model account and calculate current rates
 */
export async function fetchRatesFromRateModel(
  program: Program,
  rateModelPubkey: PublicKey,
  utilization0: number,
  utilization1: number
): Promise<{ rate0: number; rate1: number }> {
  try {
    // Fetch the rate model account
    const rateModel = await (program.account as any).rateModel.fetch(rateModelPubkey);
    
    // console.log('Rate Model:', {
    //   expRate: rateModel.expRate.toString(),
    //   targetUtilStart: rateModel.targetUtilStart.toString(),
    //   targetUtilEnd: rateModel.targetUtilEnd.toString(),
    // });
    
    // Calculate rates for both tokens
    const rate0 = calculateInterestRate(utilization0, {
      expRate: rateModel.expRate,
      targetUtilStart: rateModel.targetUtilStart,
      targetUtilEnd: rateModel.targetUtilEnd,
    });
    
    const rate1 = calculateInterestRate(utilization1, {
      expRate: rateModel.expRate,
      targetUtilStart: rateModel.targetUtilStart,
      targetUtilEnd: rateModel.targetUtilEnd,
    });
    
    return { rate0, rate1 };
  } catch (error) {
    console.error('Error fetching rate model:', error);
    // Return 0 rates as fallback
    return { rate0: 0, rate1: 0 };
  }
}

/**
 * Simple calculation if rate model fetch fails
 * Uses a basic utilization-based formula
 */
export function estimateRateFromUtilization(utilization: number): number {
  // Simple linear model: 0% util = 0% APR, 100% util = 50% APR
  // Adjust these parameters based on your protocol's rate curve
  const baseRate = 1; // Base APR at 0% utilization
  const optimalUtilization = 80; // Target utilization %
  const optimalRate = 10; // APR at optimal utilization
  const maxRate = 100; // Max APR at 100% utilization
  
  if (utilization <= optimalUtilization) {
    // Linear increase from base to optimal
    return baseRate + (optimalRate - baseRate) * (utilization / optimalUtilization);
  } else {
    // Steeper increase from optimal to max
    const excessUtil = utilization - optimalUtilization;
    const excessRange = 100 - optimalUtilization;
    return optimalRate + (maxRate - optimalRate) * (excessUtil / excessRange);
  }
}

