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
  | { getMinCollateralForDebt: {} }
  | { getBorrowLimitAndCfBpsForCollateral: {} };

export type UserPositionGetterType =
  | { userBorrowingPower: {} }
  | { userAppliedCollateralFactorBps: {} }
  | { userLiquidationCollateralFactorBps: {} }
  | { userDebtUtilizationBps: {} }
  | { userLiquidationPrice: {} }
  | { userDebtWithInterest: {} };

export interface SimulationResult {
  label: string;
  value0: string;
  value1: string;
}

export interface EmitValueArgs {
  debtAmount: number | null;
  collateralAmount: number | null;
  collateralToken: PublicKey | null;
}

