import { AddLiquidityEvent, AmmEvent, ConditionalVaultEvent, CreateAmmEvent, getVaultAddr, InitializeConditionalVaultEvent, InitializeQuestionEvent, SwapEvent, PriceMath, SplitTokensEvent, MergeTokensEvent, RemoveLiquidityEvent, ResolveQuestionEvent, LaunchpadEvent, LaunchInitializedEvent, LaunchClaimEvent, LaunchCompletedEvent, LaunchFundedEvent, LaunchRefundedEvent, LaunchStartedEvent } from "@metadaoproject/futarchy/v0.4";
import { schema, db, eq, and, or } from "@metadaoproject/indexer-db";
import { PublicKey } from "@solana/web3.js";
import type { VersionedTransactionResponse } from "@solana/web3.js";
import { PricesType, V04LaunchState, V04SwapType } from "@metadaoproject/indexer-db/lib/schema";
import * as token from "@solana/spl-token";

import { connection, conditionalVaultClient } from "../connection";

import { log } from "../logger/logger";
import { BN } from "@coral-xyz/anchor";

const logger = log.child({
  module: "v4_processor"
});

type Market = {
  marketAcct: string;
  baseMint: string;
  quoteMint: string;
}

type DBConnection = any; // TODO: Fix typing..


export async function processAmmEvent(event: { name: string; data: AmmEvent }, signature: string, transactionResponse: VersionedTransactionResponse) {
  switch (event.name) {
    case "CreateAmmEvent":
      await handleCreateAmmEvent(event.data as CreateAmmEvent);
      break;
    case "AddLiquidityEvent":
      await handleAddLiquidityEvent(event.data as AddLiquidityEvent);
      break;
    case "RemoveLiquidityEvent":
      await handleRemoveLiquidityEvent(event.data as RemoveLiquidityEvent);
      break;
    case "SwapEvent":
      await handleSwapEvent(event.data as SwapEvent, signature, transactionResponse);
      break;
    case "CrankThatTwapEvent":
      break;
    default:
      logger.info(`Unknown event ${event.name}`);
  }
}

async function handleCreateAmmEvent(event: CreateAmmEvent) {
  try {

    await insertTokenIfNotExists(db, event.lpMint);
    await insertTokenIfNotExists(db, event.baseMint);
    await insertTokenIfNotExists(db, event.quoteMint);
    await insertMarketIfNotExists(db, {
      marketAcct: event.common.amm.toBase58(),
      baseMint: event.baseMint.toString(),
      quoteMint: event.quoteMint.toString(),
    });

    await db.insert(schema.v0_4_amms).values({
      ammAddr: event.common.amm.toString(),
      lpMintAddr: event.lpMint.toString(),
      createdAtSlot: event.common.slot.toString(),
      baseMintAddr: event.baseMint.toString(),
      quoteMintAddr: event.quoteMint.toString(),
      latestAmmSeqNumApplied: 0n,
      baseReserves: 0n,
      quoteReserves: 0n,
    }).onConflictDoNothing();

  } catch (error) {
    logger.error(error, "Error in handleCreateAmmEvent");
  }
}

async function handleAddLiquidityEvent(event: AddLiquidityEvent) {
  try {
    const amm = await db.select().from(schema.v0_4_amms).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString())).limit(1);

    if (amm.length === 0) {
      logger.info("AMM not found", event.common.amm.toString());
      return;
    }

    if (amm[0].latestAmmSeqNumApplied >= BigInt(event.common.seqNum.toString())) {
      logger.info("Already applied", event.common.seqNum.toString());
      return;
    }

    await insertPriceIfNotDuplicate(db, amm, event);

    await db.update(schema.v0_4_amms).set({
      baseReserves: BigInt(event.common.postBaseReserves.toString()),
      quoteReserves: BigInt(event.common.postQuoteReserves.toString()),
      latestAmmSeqNumApplied: BigInt(event.common.seqNum.toString()),
    }).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString()));

    logger.info("Updated AMM", event.common.amm.toString());

  } catch (error) {
    logger.error(error, "Error in handleAddLiquidityEvent");
  }
}

async function handleRemoveLiquidityEvent(event: RemoveLiquidityEvent) {
  try {

    const amm = await db.select().from(schema.v0_4_amms).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString())).limit(1);

    if (amm.length === 0) {
      logger.info("AMM not found", event.common.amm.toString());
      return;
    }

    if (amm[0].latestAmmSeqNumApplied >= BigInt(event.common.seqNum.toString())) {
      logger.info("Already applied", event.common.seqNum.toString());
      return;
    }

    await insertPriceIfNotDuplicate(db, amm, event);

    await db.update(schema.v0_4_amms).set({
      baseReserves: BigInt(event.common.postBaseReserves.toString()),
      quoteReserves: BigInt(event.common.postQuoteReserves.toString()),
      latestAmmSeqNumApplied: BigInt(event.common.seqNum.toString()),
    }).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString()));

    logger.info("Updated AMM", event.common.amm.toString());

  } catch (error) {
    logger.error(error, "Error in handleRemoveLiquidityEvent");
  }
}

async function handleSwapEvent(event: SwapEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    if (transactionResponse.blockTime === null || transactionResponse.blockTime === undefined) {
      return;
    };

    await db.insert(schema.v0_4_swaps).values({
      signature: signature,
      slot: transactionResponse.slot.toString(),
      // @ts-ignore - fixed above in the if statement
      blockTime: new Date(transactionResponse.blockTime * 1000),
      swapType: event.swapType.buy ? V04SwapType.Buy : V04SwapType.Sell,
      ammAddr: event.common.amm.toString(),
      userAddr: event.common.user.toString(),
      inputAmount: event.inputAmount.toString(),
      outputAmount: event.outputAmount.toString(),
      ammSeqNum: BigInt(event.common.seqNum.toString())
    }).onConflictDoNothing();

    const amm = await db.select().from(schema.v0_4_amms).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString())).limit(1);

    if (amm.length === 0) {
      logger.info("AMM not found", event.common.amm.toString());
      return;
    }

    logger.info("latestAmmSeqNumApplied", amm[0].latestAmmSeqNumApplied.toString());
    logger.info("event.common.seqNum", event.common.seqNum.toString());
    if (amm[0].latestAmmSeqNumApplied >= BigInt(event.common.seqNum.toString())) {
      logger.info("Already applied", event.common.seqNum.toString());
      return;
    }

    await insertPriceIfNotDuplicate(db, amm, event);

    await db.update(schema.v0_4_amms).set({
      baseReserves: BigInt(event.common.postBaseReserves.toString()),
      quoteReserves: BigInt(event.common.postQuoteReserves.toString()),
      latestAmmSeqNumApplied: BigInt(event.common.seqNum.toString()),
    }).where(eq(schema.v0_4_amms.ammAddr, event.common.amm.toString()));

  } catch (error) {
    logger.error(error, "Error in handleSwapEvent");
  }
}

async function handleSplitEvent(event: SplitTokensEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    const insertValues = {
      vaultAddr: event.vault.toString(),
      vaultSeqNum: BigInt(event.seqNum.toString()),
      signature: signature,
      slot: transactionResponse.slot.toString(),
      amount: BigInt(event.amount.toString())
      // Note: createdAt will be set automatically by the default value
    };
   
    // First verify the vault exists
    const vault = await db.select()
      .from(schema.v0_4_conditional_vaults)
      .where(eq(schema.v0_4_conditional_vaults.conditionalVaultAddr, event.vault.toString()))
      .limit(1);

    if (vault.length === 0) {
      logger.warn("Warning: Referenced vault does not exist:", event.vault.toString());
    }

    await db.insert(schema.v0_4_splits)
      .values(insertValues)
      .onConflictDoNothing();
    
  } catch (error) {
    logger.error(error, "Error in handleSplitEvent");
  }
}

async function handleMergeEvent(event: MergeTokensEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    
    await db.insert(schema.v0_4_merges).values({
      vaultAddr: event.vault.toString(),
      vaultSeqNum: BigInt(event.seqNum.toString()),
      signature: signature,
      slot: transactionResponse.slot.toString(),
      amount: BigInt(event.amount.toString())
    }).onConflictDoNothing();
    
  } catch (error) {
    logger.error(error, "Error in handleMergeEvent");
  }
}

async function insertTokenIfNotExists(db: DBConnection, mintAcct: PublicKey) {
  try {
    const existingToken = await db.select().from(schema.tokens).where(eq(schema.tokens.mintAcct, mintAcct.toString())).limit(1);
    if (existingToken.length === 0) {
      logger.info("Inserting token", mintAcct.toString());
    const mint: token.Mint = await token.getMint(connection, mintAcct);
    await db.insert(schema.tokens).values({
      mintAcct: mintAcct.toString(),
      symbol: mintAcct.toString().slice(0, 3),
      name: mintAcct.toString().slice(0, 3),
      decimals: mint.decimals,
      supply: mint.supply,
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  } catch (e) {
    logger.warn(e, "Error inserting the token");
  }
}


export async function processVaultEvent(event: { name: string; data: ConditionalVaultEvent }, signature: string, transactionResponse: VersionedTransactionResponse) {
  switch (event.name) {
    case "InitializeQuestionEvent":
      await handleInitializeQuestionEvent(event.data as InitializeQuestionEvent);
      break;
    case "InitializeConditionalVaultEvent":
      await handleInitializeConditionalVaultEvent(event.data as InitializeConditionalVaultEvent);
      break;
    case "SplitTokensEvent":
      await handleSplitEvent(event.data as SplitTokensEvent, signature, transactionResponse);
      break;
    case "MergeTokensEvent":
      await handleMergeEvent(event.data as MergeTokensEvent, signature, transactionResponse);
      break;
    case "ResolveQuestionEvent":
      await handleResolveQuestionEvent(event.data as ResolveQuestionEvent, signature, transactionResponse);
      break;
    default:
      logger.info("Unknown Vault event", event.name);
  }
}

async function handleInitializeQuestionEvent(event: InitializeQuestionEvent) {
  try {
    
    await db.insert(schema.v0_4_questions).values({
      questionAddr: event.question.toString(),
      isResolved: false,
      oracleAddr: event.oracle.toString(),
      numOutcomes: event.numOutcomes,
      payoutNumerators: Array(event.numOutcomes).fill(0),
      payoutDenominator: 0n,
      questionId: event.questionId,
    }).onConflictDoNothing();
    
  } catch (error) {
    logger.error(error, "Error in handleInitializeQuestionEvent");
  }
}

async function handleResolveQuestionEvent(event: ResolveQuestionEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    logger.info("Resolving question", event.question.toString());

    let payoutDenominator = 0;
    for (const numerator of event.payoutNumerators) {
      payoutDenominator += numerator;
    }
    await db.update(schema.v0_4_questions).set({
      isResolved: true,
      payoutNumerators: event.payoutNumerators,
      payoutDenominator: BigInt(payoutDenominator),
    }).where(eq(schema.v0_4_questions.questionAddr, event.question.toString()));

    //update v4 metric decisions
    //completed at = now
    await db.update(schema.v0_4_metric_decisions).set({
      completedAt: new Date(),
    }).where(
      or(
        eq(schema.v0_4_metric_decisions.outcomeQuestionAddr, event.question.toString()),
        eq(schema.v0_4_metric_decisions.metricQuestionAddr, event.question.toString())
      )
    );

  } catch (error) {
    logger.error(error, "Error in handleResolveQuestionEvent");
  }
}

async function handleInitializeConditionalVaultEvent(event: InitializeConditionalVaultEvent) {
  try {
    const vaultAddr = getVaultAddr(conditionalVaultClient.vaultProgram.programId, event.question, event.underlyingTokenMint)[0];
    
    await db.transaction(async (trx) => {
      if (!await doesQuestionExist(trx, event)) {
        return;
      }
      await insertTokenIfNotExists(trx, event.underlyingTokenMint);
      await insertTokenAccountIfNotExists(trx, event);
      await insertConditionalVault(trx, event, vaultAddr);
    });
    
  } catch (error) {
    logger.error(error, "Error in handleInitializeConditionalVaultEvent");
  }
}

async function doesQuestionExist(db: DBConnection, event: InitializeConditionalVaultEvent): Promise<boolean> {
  const existingQuestion = await db.select().from(schema.v0_4_questions).where(eq(schema.v0_4_questions.questionAddr, event.question.toString())).limit(1);
  return existingQuestion.length > 0;
  // if (existingQuestion.length === 0) {
  //   await trx.insert(schema.v0_4_questions).values({
  //     questionAddr: event.question.toString(),
  //     isResolved: false,
  //     oracleAddr: event.oracle.toString(),
  //     numOutcomes: event.numOutcomes,
  //     payoutNumerators: Array(event.numOutcomes).fill(0),
  //     payoutDenominator: 0n,
  //     questionId: event.questionId,
  //   });
  // }
  
}

async function insertTokenAccountIfNotExists(db: DBConnection, event: InitializeConditionalVaultEvent) {
  const existingTokenAcct = await db.select()
    .from(schema.tokenAccts)
    .where(eq(schema.tokenAccts.tokenAcct, event.vaultUnderlyingTokenAccount.toString()))
    .limit(1);

  if (existingTokenAcct.length === 0) {
    try {
      await db.insert(schema.tokenAccts).values({
        tokenAcct: event.vaultUnderlyingTokenAccount.toString(),
        mintAcct: event.underlyingTokenMint.toString(),
        ownerAcct: event.vaultUnderlyingTokenAccount.toString(),
        amount: 0n,
      });
    } catch (e) {
      logger.warn(e, "Error inserting the token account");
    }
  }
}

async function insertMarketIfNotExists(db: DBConnection, market: Market) {
  const existingMarket = await db.select()
    .from(schema.markets)
    .where(eq(schema.markets.marketAcct, market.marketAcct))
    .limit(1);

  if (existingMarket.length === 0) {
    try {
      await db.insert(schema.markets).values({
        marketAcct: market.marketAcct,
        baseMintAcct: market.baseMint,
        quoteMintAcct: market.quoteMint,
        marketType: 'amm',
        createTxSig: '',
        baseLotSize: 0n,
        quoteLotSize: 0n,
        quoteTickSize: 0n,
        baseMakerFee: 0,
        quoteMakerFee: 0,
        baseTakerFee: 0,
        quoteTakerFee: 0
      }).onConflictDoNothing();
    } catch (e) {
      logger.warn(e, "Error inserting the market");
    }
  }
}

async function insertPriceIfNotDuplicate(db: DBConnection, amm: any[], event: AddLiquidityEvent | SwapEvent | RemoveLiquidityEvent) {
  logger.info("insertPriceIfNotDuplicate::event", event);
  const existingPrice = await db.select()
    .from(schema.prices)
    .where(and(
      eq(schema.prices.marketAcct, event.common.amm.toBase58()),
      eq(schema.prices.updatedSlot, event.common.slot.toString())
    ))
    .limit(1);

  if (existingPrice.length > 0) {
    logger.info("Price already exists", event.common.amm.toBase58(), BigInt(event.common.slot.toString()));
    return;
  }

  const ammPrice = PriceMath.getAmmPriceFromReserves(event.common.postBaseReserves, event.common.postQuoteReserves);
  const baseToken = await db.select()
    .from(schema.tokens)
    .where(eq(schema.tokens.mintAcct, amm[0].baseMintAddr))
    .limit(1);
  const quoteToken = await db.select()
    .from(schema.tokens)
    .where(eq(schema.tokens.mintAcct, amm[0].quoteMintAddr))
    .limit(1);

  if (!baseToken.length || !quoteToken.length) {
    throw new Error(`Token not found: base=${!!baseToken.length}, quote=${!!quoteToken.length}`);
  }

  const humanPrice = PriceMath.getHumanPrice(ammPrice, baseToken[0].decimals, quoteToken[0].decimals);

  try {
    await db.insert(schema.prices).values({
      marketAcct: event.common.amm.toBase58(),
      baseAmount: BigInt(event.common.postBaseReserves.toString()),
      quoteAmount: BigInt(event.common.postQuoteReserves.toString()),
      price: humanPrice.toString(),
      updatedSlot: BigInt(event.common.slot.toString()),
      createdBy: 'amm-market-indexer',
      pricesType: PricesType.Conditional,
    }).onConflictDoNothing();
  } catch (error) {
    logger.error(
      error instanceof Error
        ? new Error(`Error in insertPriceIfNotDuplicate: ${error.message}`)
        : new Error("Unknown error in insertPriceIfNotDuplicate")
    );
  }
}

async function insertConditionalVault(db: DBConnection, event: InitializeConditionalVaultEvent, vaultAddr: PublicKey) {
  try {
    await db.insert(schema.v0_4_conditional_vaults).values({
      conditionalVaultAddr: vaultAddr.toString(),
      questionAddr: event.question.toString(),
      underlyingMintAcct: event.underlyingTokenMint.toString(),
      underlyingTokenAcct: event.vaultUnderlyingTokenAccount.toString(),
      pdaBump: event.pdaBump,
        latestVaultSeqNumApplied: 0n,
      }).onConflictDoNothing();
  } catch (error) {
    logger.warn(error, "Error inserting the conditional vault");
  }
}


// async function fetchTransactionResponses(eligibleSignatures: { signature: string }[]) {
//   try {
//     return await connection.getTransactions(
//       eligibleSignatures.map(s => s.signature),
//       { commitment: "confirmed", maxSupportedTransactionVersion: 1 }
//     );
//   } catch (error: unknown) {
//     logger.errorWithChatBotAlert([
//       error instanceof Error
//         ? `Error fetching transaction responses: ${error.message}`
//         : "Unknown error fetching transaction responses"
//     ]);
//     return [];
//   }
// }

export async function processLaunchpadEvent(event: { name: string; data: LaunchpadEvent }, signature: string, transactionResponse: VersionedTransactionResponse) {
  switch (event.name) {
    case "LaunchClaimEvent":
      await handleLaunchClaimEvent(event.data as LaunchClaimEvent, signature, transactionResponse);
      break;
    case "LaunchCompletedEvent":
      await handleLaunchCompletedEvent(event.data as LaunchCompletedEvent, signature, transactionResponse);
      break;
    case "LaunchFundedEvent":
      await handleLaunchFundedEvent(event.data as LaunchFundedEvent, signature, transactionResponse);
      break;
    case "LaunchInitializedEvent":
      await handleLaunchInitializedEvent(event.data as LaunchInitializedEvent, signature, transactionResponse);
      break;
    case "LaunchRefundedEvent":
      await handleLaunchRefundedEvent(event.data as LaunchRefundedEvent, signature, transactionResponse);
      break;
    case "LaunchStartedEvent":
      await handleLaunchStartedEvent(event.data as LaunchStartedEvent, signature, transactionResponse);
      break;
    default:
      logger.info("Unknown Launchpad event", event.name);
  }
}

async function handleLaunchClaimEvent(event: LaunchClaimEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    const [existingClaim] = await db.select()
      .from(schema.v0_4_claims)
      .where(and(
        eq(schema.v0_4_claims.launchAddr, event.launch.toString()),
        eq(schema.v0_4_claims.funderAddr, event.funder.toString()),
        eq(schema.v0_4_claims.slot, BigInt(event.common.slot.toString()))
      ))
      .limit(1);

    if (existingClaim) {
      logger.info(`Claim already exists for launch ${event.launch.toString()} by ${event.funder.toString()} at slot ${existingClaim.slot.toString()}`);
      return;
    }

    await db.insert(schema.v0_4_claims).values({
      launchAddr: event.launch.toString(),
      funderAddr: event.funder.toString(),
      tokensClaimed: event.tokensClaimed.toString(),
      fundingRecordAddr: event.fundingRecord.toString(),
      slot: BigInt(event.common.slot.toString()),
      timestamp: new Date(event.common.unixTimestamp.mul(new BN(1000)).toNumber()),
    }).onConflictDoNothing();

    await db.update(schema.v0_4_funding_records).set({
      isClaimed: true,
      updatedAtSlot: BigInt(event.common.slot.toString()),
    }).where(eq(schema.v0_4_funding_records.fundingRecordAddr, event.fundingRecord.toString()));
  } catch (error) {
    logger.error(error, "Error in handleLaunchClaimEvent");
  }
}

async function handleLaunchCompletedEvent(event: LaunchCompletedEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    const [existingLaunch] = await db.select()
      .from(schema.v0_4_launches)
      .where(eq(schema.v0_4_launches.launchAddr, event.launch.toString()))
      .limit(1);

    if (existingLaunch && existingLaunch.updatedAtSlot > BigInt(event.common.slot.toString())) {
      logger.info(`Launch ${event.launch.toString()} already updated at slot ${existingLaunch.updatedAtSlot.toString()}`);
      return;
    }

    await db.update(schema.v0_4_launches).set({
      state: event.finalState.toString() === "Complete" ? V04LaunchState.Complete : V04LaunchState.Refunding, // Only these two states are possible
      committedAmount: BigInt(event.totalCommitted.toString()),
      latestLaunchSeqNumApplied: BigInt(event.common.launchSeqNum.toString()),
      updatedAtSlot: BigInt(event.common.slot.toString()),
    }).where(eq(schema.v0_4_launches.launchAddr, event.launch.toString()));
  } catch (error) {
    logger.error(error, "Error in handleLaunchCompletedEvent");
  }
}

async function handleLaunchFundedEvent(event: LaunchFundedEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    const [existingFund] = await db.select()
      .from(schema.v0_4_funds)
      .where(and(
        eq(schema.v0_4_funds.funderAddr, event.funder.toString()),
        eq(schema.v0_4_funds.launchAddr, event.launch.toString()),
        eq(schema.v0_4_funds.slot, BigInt(event.common.slot.toString()))
      ))
      .limit(1);

    if (existingFund) {
      logger.info(`Fund already exists for launch ${event.launch.toString()} by ${event.funder.toString()} at slot ${existingFund.slot.toString()}`);
      return;
    }

    await db.insert(schema.v0_4_funds).values({
      launchAddr: event.launch.toString(),
      funderAddr: event.funder.toString(),
      slot: BigInt(event.common.slot.toString()),
      timestamp: new Date(event.common.unixTimestamp.mul(new BN(1000)).toNumber()),
      usdcAmount: event.amount.toString(),
    }).onConflictDoNothing();

    await db.insert(schema.v0_4_funding_records).values({
      fundingRecordAddr: event.fundingRecord.toString(),
      launchAddr: event.launch.toString(),
      funderAddr: event.funder.toString(),
      committedAmount: BigInt(event.totalCommittedByFunder.toString()),
      latestFundingRecordSeqNumApplied: BigInt(event.fundingRecordSeqNum.toString()),
      isClaimed: false,
      isRefunded: false,
      updatedAtSlot: BigInt(event.common.slot.toString()),
    }).onConflictDoUpdate({
      target: schema.v0_4_funding_records.fundingRecordAddr,
      set: {
        committedAmount: BigInt(event.totalCommittedByFunder.toString()),
        latestFundingRecordSeqNumApplied: BigInt(event.fundingRecordSeqNum.toString()),
      }
    });

    await db.update(schema.v0_4_launches).set({
      committedAmount: BigInt(event.totalCommitted.toString()),
      latestLaunchSeqNumApplied: BigInt(event.common.launchSeqNum.toString()),
      updatedAtSlot: BigInt(event.common.slot.toString()),
    }).where(eq(schema.v0_4_launches.launchAddr, event.launch.toString()));
  } catch (error) {
    logger.error(error, "Error in handleLaunchFundedEvent");
  }
}

async function handleLaunchInitializedEvent(event: LaunchInitializedEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    const [existingLaunch] = await db.select()
      .from(schema.v0_4_launches)
      .where(eq(schema.v0_4_launches.launchAddr, event.launch.toString()))
      .limit(1);

    if (existingLaunch && existingLaunch.updatedAtSlot > BigInt(event.common.slot.toString())) {
      logger.info(`Launch ${event.launch.toString()} already exists with last updated slot ${existingLaunch.updatedAtSlot.toString()}`);
      return;
    }

    await insertTokenIfNotExists(db, event.tokenMint);

    await db.insert(schema.v0_4_launches).values({
      launchAddr: event.launch.toString(),
      minimumRaiseAmount: BigInt(event.minimumRaiseAmount.toString()),
      creator: event.creator.toString(),
      launchSigner: event.launchSigner.toString(),
      launchSignerPdaBump: event.launchSignerPdaBump,
      launchUsdcVault: event.launchUsdcVault.toString(),
      launchTokenVault: event.launchTokenVault.toString(),
      tokenMintAcct: event.tokenMint.toString(),
      pdaBump: event.pdaBump,
      daoAddr: null,
      daoTreasuryAddr: null,
      treasuryUsdcAcct: null,
      committedAmount: 0n,
      latestLaunchSeqNumApplied: 0n,
      state: V04LaunchState.Initialized,
      slotStarted: 0n,
      updatedAtSlot: BigInt(event.common.slot.toString()),
    }).onConflictDoNothing();
  } catch (error) {
    logger.error(error, "Error in handleLaunchInitializedEvent");
  }
}

async function handleLaunchRefundedEvent(event: LaunchRefundedEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    const [existingRefund] = await db.select()
      .from(schema.v0_4_refunds)
      .where(and(
        eq(schema.v0_4_refunds.funderAddr, event.funder.toString()),
        eq(schema.v0_4_refunds.launchAddr, event.launch.toString()),
        eq(schema.v0_4_refunds.slot, BigInt(event.common.slot.toString()))
      ))
      .limit(1);

    if (existingRefund) {
      logger.info(`Refund already exists for launch ${event.launch.toString()} by ${event.funder.toString()} at slot ${existingRefund.slot.toString()}`);
      return;
    }

    await db.insert(schema.v0_4_refunds).values({
      launchAddr: event.launch.toString(),
      funderAddr: event.funder.toString(),
      slot: BigInt(event.common.slot.toString()),
      timestamp: new Date(event.common.unixTimestamp.mul(new BN(1000)).toNumber()),
      usdcAmount: event.usdcRefunded.toString(),
    }).onConflictDoNothing();

    await db.update(schema.v0_4_funding_records).set({
      isRefunded: true,
      updatedAtSlot: BigInt(event.common.slot.toString()),
    }).where(eq(schema.v0_4_funding_records.fundingRecordAddr, event.fundingRecord.toString()));
  } catch (error) {
    logger.error(error, "Error in handleLaunchRefundedEvent");
  }
}

async function handleLaunchStartedEvent(event: LaunchStartedEvent, signature: string, transactionResponse: VersionedTransactionResponse) {
  try {
    const [existingLaunch] = await db.select()
      .from(schema.v0_4_launches)
      .where(eq(schema.v0_4_launches.launchAddr, event.launch.toString()))
      .limit(1);

    if (existingLaunch && existingLaunch.updatedAtSlot > BigInt(event.common.slot.toString())) {
      logger.info(`Launch ${event.launch.toString()} already updated at slot ${existingLaunch.updatedAtSlot.toString()}`);
      return;
    }

    await db.update(schema.v0_4_launches).set({
      state: V04LaunchState.Live,
      slotStarted: BigInt(event.slotStarted.toString()),
      latestLaunchSeqNumApplied: BigInt(event.common.launchSeqNum.toString()),
      updatedAtSlot: BigInt(event.common.slot.toString()),
    }).where(eq(schema.v0_4_launches.launchAddr, event.launch.toString()));
  } catch (error) {
    logger.error(error, "Error in handleLaunchStartedEvent");
  }
}
