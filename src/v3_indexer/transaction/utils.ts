import { InstructionType } from "@metadaoproject/indexer-db/lib/schema";
import {
  Transaction,
} from "./serializer";
import { BN } from "@coral-xyz/anchor";

import { log } from "../../logger/logger";

const logger = log.child({
  module: "transaction-utils"
});

export function getMainIxTypeFromTransaction(
  tx: Transaction
): InstructionType | null {
  const hasSwap = tx.instructions.some((ix) => ix.name === "swap");
  const hasMint = tx.instructions.some(
    (ix) => ix.name === "mintConditionalTokens"
  );
  if (hasSwap && hasMint) {
    return InstructionType.VaultMintAndAmmSwap;
  }
  if (hasSwap) {
    return InstructionType.AmmSwap;
  }
  if (tx.instructions.some((ix) => ix.name === "addLiquidity")) {
    return InstructionType.AmmDeposit;
  }
  if (tx.instructions.some((ix) => ix.name === "removeLiquidity")) {
    return InstructionType.AmmWithdraw;
  }
  if (tx.instructions.some((ix) => ix.name === "placeOrder")) {
    return InstructionType.OpenbookPlaceOrder;
  }
  if (tx.instructions.some((ix) => ix.name === "cancelOrder")) {
    return InstructionType.OpenbookCancelOrder;
  }
  if (hasMint) {
    return InstructionType.VaultMintConditionalTokens;
  }
  if (tx.instructions.some((ix) => ix.name === "initializeProposal")) {
    return InstructionType.AutocratInitializeProposal;
  }
  if (tx.instructions.some((ix) => ix.name === "finalizeProposal")) {
    return InstructionType.AutocratFinalizeProposal;
  }
  if (
    tx.instructions.some(
      (ix) => ix.name === "mergeConditionalTokensForUnderlyingTokens"
    )
  ) {
    return InstructionType.VaultMergeConditionalTokens;
  }
  if (
    tx.instructions.some(
      (ix) => ix.name === "redeemConditionalTokensForUnderlyingTokens"
    )
  ) {
    return InstructionType.VaultRedeemConditionalTokensForUnderlyingTokens;
  }
  return null;
}

export function getHumanPrice(
  ammPrice: BN,
  baseDecimals: number,
  quoteDecimals: number
): number {
  const decimalScalar = new BN(10).pow(
    new BN(quoteDecimals - baseDecimals).abs()
  );
  const price1e12 =
    quoteDecimals > baseDecimals
      ? ammPrice.div(decimalScalar)
      : ammPrice.mul(decimalScalar);

  try {
    return price1e12.toNumber() / 1e12;
  } catch (e) {
    logger.warn("toNumber failed, returning div by 1e12");
    return price1e12.div(new BN(1e12)).toNumber();
  }
}