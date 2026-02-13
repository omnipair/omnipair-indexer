/**
 * Types for pair view getters
 */

import { PublicKey } from '@solana/web3.js';

export type GetterType =
  | { emaPrice0Nad: {} }
  | { emaPrice1Nad: {} }
  | { spotPrice0Nad: {} }
  | { spotPrice1Nad: {} }
  | { k: {} }
  | { getRates: {} }
  | { getBorrowLimitAndCfBpsForCollateral: {} }
  | { reserves: {} }
  | { cashReserves: {} }
  | { swapQuote: {} };

export type UserPositionGetterType =
  | { userDynamicBorrowLimit: {} }
  | { userDynamicCollateralFactorBps: {} }
  | { userLiquidationCfBps: {} }
  | { userDebtUtilizationBps: {} }
  | { userLiquidationPrice: {} }
  | { userDebtWithInterest: {} }
  | { userIsLiquidatable: {} }
  | { userCollateralValueWithImpact: {} }
  | { userLiquidationBorrowLimit: {} };

export interface SimulationResult {
  label: string;
  value0: string;
  value1: string;
  value2: string;
}

export interface EmitValueArgs {
  amount: number | null;
  tokenMint: PublicKey | null;
}

