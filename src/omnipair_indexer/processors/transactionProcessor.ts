import { log } from "../../logger/logger";
import { db } from "@omnipair/indexer-db";
import { 
  transactions, 
  transactionDetails, 
  userPositions, 
  pairs,
  TransactionType,
  TransactionStatus 
} from "@omnipair/indexer-db/lib/schema";
import { OmnipairEventType, getTransactionTypeFromEvent } from "../events";
import { PublicKey } from "@solana/web3.js";
import { eq, sql } from "drizzle-orm";

const logger = log.child({
  module: "transaction_processor"
});

export class TransactionProcessor {
  async processTransaction(
    txSignature: string,
    blockTime: Date,
    slot: number,
    pairAddress: string,
    userAddress: string,
    events: OmnipairEventType[]
  ) {
    try {
      console.log(`[TransactionProcessor] Processing transaction ${txSignature} with ${events.length} events`);
      console.log(`[TransactionProcessor] Events:`, events);
      logger.debug({ txSignature, events }, "Processing transaction");

      // Determine transaction type from events
      const transactionType = this.determineTransactionType(events);
      
      // Create base transaction record
      await this.createTransactionRecord(
        txSignature,
        blockTime,
        slot,
        pairAddress,
        userAddress,
        transactionType
      );

      // Process each event and create detailed records
      for (const event of events) {
        await this.processEventDetails(
          txSignature,
          blockTime,
          pairAddress,
          userAddress,
          event
        );
      }

      // Update user positions if needed
      await this.updateUserPositions(userAddress, pairAddress, events);

      logger.debug({ txSignature }, "Transaction processed successfully");
    } catch (error) {
      logger.error({ error, txSignature }, "Error processing transaction");
      throw error;
    }
  }

  private determineTransactionType(events: OmnipairEventType[]): TransactionType {
    // If multiple events, prioritize the most important one
    const eventTypes = events.map(event => getTransactionTypeFromEvent(event));
    
    // Priority order: liquidate > borrow/repay > swap > liquidity > collateral
    if (eventTypes.includes("liquidate")) return TransactionType.LIQUIDATE;
    if (eventTypes.includes("borrow")) return TransactionType.BORROW;
    if (eventTypes.includes("repay")) return TransactionType.REPAY;
    if (eventTypes.includes("swap")) return TransactionType.SWAP;
    if (eventTypes.includes("add_liquidity") || eventTypes.includes("remove_liquidity")) {
      return eventTypes.includes("add_liquidity") ? TransactionType.ADD_LIQUIDITY : TransactionType.REMOVE_LIQUIDITY;
    }
    if (eventTypes.includes("add_collateral") || eventTypes.includes("remove_collateral")) {
      return eventTypes.includes("add_collateral") ? TransactionType.ADD_COLLATERAL : TransactionType.REMOVE_COLLATERAL;
    }
    
    return TransactionType.SWAP; // Default fallback
  }

  private async createTransactionRecord(
    txSignature: string,
    blockTime: Date,
    slot: number,
    pairAddress: string,
    userAddress: string,
    transactionType: TransactionType
  ) {
    await db.insert(transactions).values({
      txSignature,
      blockTime,
      slot: slot.toString(),
      pairAddress,
      userAddress,
      transactionType,
      status: TransactionStatus.SUCCESS,
    }).onConflictDoNothing();
  }

  private async processEventDetails(
    txSignature: string,
    blockTime: Date,
    pairAddress: string,
    userAddress: string,
    event: OmnipairEventType
  ) {
    const transactionType = getTransactionTypeFromEvent(event) as TransactionType;
    
    // Calculate prices for swap events
    let price0: string | undefined;
    let price1: string | undefined;
    let volumeUsd: string | undefined;
    let feesUsd: string | undefined;

    if (event.type === "SwapEvent") {
      if (event.amount0_out > 0n && event.amount1_in > 0n) {
        price0 = (Number(event.amount1_in) / Number(event.amount0_out)).toString();
      }
      if (event.amount1_out > 0n && event.amount0_in > 0n) {
        price1 = (Number(event.amount0_in) / Number(event.amount1_out)).toString();
      }
      // TODO: Calculate USD volume and fees
    }

    await db.insert(transactionDetails).values({
      time: blockTime,
      txSignature,
      pairAddress,
      userAddress,
      transactionType,
      amount0In: event.type === "SwapEvent" ? event.amount0_in.toString() : "0",
      amount1In: event.type === "SwapEvent" ? event.amount1_in.toString() : "0",
      amount0Out: event.type === "SwapEvent" ? event.amount0_out.toString() : "0",
      amount1Out: event.type === "SwapEvent" ? event.amount1_out.toString() : "0",
      collateralChange0: event.type === "AdjustCollateralEvent" ? event.amount0.toString() : undefined,
      collateralChange1: event.type === "AdjustCollateralEvent" ? event.amount1.toString() : undefined,
      debtChange0: event.type === "AdjustDebtEvent" ? event.amount0.toString() : undefined,
      debtChange1: event.type === "AdjustDebtEvent" ? event.amount1.toString() : undefined,
      liquidityChange: event.type === "AdjustLiquidityEvent" ? event.liquidity.toString() : undefined,
      price0,
      price1,
      volumeUsd,
      feesUsd,
      eventData: event as any,
    });
  }

  private async updateUserPositions(
    userAddress: string,
    pairAddress: string,
    events: OmnipairEventType[]
  ) {
    for (const event of events) {
      if (event.type === "UserPositionCreatedEvent") {
        await this.createUserPosition(event);
      } else if (event.type === "UserPositionUpdatedEvent") {
        await this.updateUserPosition(event);
      } else if (event.type === "UserPositionLiquidatedEvent") {
        await this.handleLiquidation(event);
      }
    }
  }

  private async createUserPosition(event: any) {
    await db.insert(userPositions).values({
      positionAddress: event.position,
      userAddress: event.user,
      pairAddress: event.pair,
      collateral0Amount: "0",
      collateral1Amount: "0",
      debt0Shares: "0",
      debt1Shares: "0",
    }).onConflictDoNothing();
  }

  private async updateUserPosition(event: any) {
    await db.update(userPositions)
      .set({
        collateral0Amount: event.collateral0.toString(),
        collateral1Amount: event.collateral1.toString(),
        debt0Shares: event.debt0_shares.toString(),
        debt1Shares: event.debt1_shares.toString(),
        updatedAt: new Date(),
      })
      .where(eq(userPositions.positionAddress, event.position));
  }

  private async handleLiquidation(event: any) {
    // Update position after liquidation
    await db.update(userPositions)
      .set({
        collateral0Amount: sql`collateral0_amount - ${event.collateral0_liquidated}`,
        collateral1Amount: sql`collateral1_amount - ${event.collateral1_liquidated}`,
        debt0Shares: sql`debt0_shares - ${event.debt0_liquidated}`,
        debt1Shares: sql`debt1_shares - ${event.debt1_liquidated}`,
        updatedAt: new Date(),
      })
      .where(eq(userPositions.positionAddress, event.position));
  }
}

export const transactionProcessor = new TransactionProcessor();
