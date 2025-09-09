import { log } from "../../logger/logger";
import { connection } from "../../connection";
import { PublicKey, ConfirmedSignatureInfo, SignaturesForAddressOptions } from "@solana/web3.js";
import { db } from "@omnipair/indexer-db";
import { transactionWatchers, TransactionWatchStatus } from "@omnipair/indexer-db/lib/schema";
import { eq } from "drizzle-orm";
import pLimit from "p-limit";
import { transactionProcessor } from "../processors/transactionProcessor";
import { logParser } from "../processors/logParser";

const logger = log.child({
  module: "omnipair_backfill"
});

// Rate limiting to avoid hitting RPC limits
const limit = pLimit(10);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Omnipair program ID
const OMNIPAIR_PROGRAM_ID = new PublicKey("3tJrAXnjofAw8oskbMaSo9oMAYuzdBgVbW3TvQLdMEBd");

export interface BackfillOptions {
  fromSlot?: number;
  toSlot?: number;
  reprocess?: boolean;
  batchSize?: number;
}

export class OmnipairBackfiller {
  private isRunning = false;

  async backfill(options: BackfillOptions = {}): Promise<{message: string, error: Error | undefined}> {
    if (this.isRunning) {
      return { message: "Backfill already running", error: new Error("Backfill already running") };
    }

    this.isRunning = true;
    const startTime = performance.now();

    try {
      logger.info("Starting Omnipair backfill...", options);

      // Initialize transaction watcher if it doesn't exist
      await this.initializeTransactionWatcher();

      // Get transaction history
      const signatures = await this.getTransactionHistory(options);
      logger.info(`Found ${signatures.length} transactions to process`);

      // Process transactions in batches
      await this.processTransactions(signatures, options);

      const endTime = performance.now();
      const message = `Backfilling ${signatures.length} transactions complete - took ${(endTime - startTime) / 1000} seconds`;
      logger.info(message);

      return { message, error: undefined };
    } catch (error) {
      logger.error({ error }, "Backfill failed");
      return { message: "Backfill failed", error: error as Error };
    } finally {
      this.isRunning = false;
    }
  }

  async gapFill(): Promise<{message: string, error: Error | undefined}> {
    if (this.isRunning) {
      return { message: "Gap fill already running", error: new Error("Gap fill already running") };
    }

    this.isRunning = true;
    const startTime = performance.now();

    try {
      logger.info("Starting gap fill...");

      // Get the latest processed transaction
      const watcher = await this.getTransactionWatcher();
      if (!watcher?.latestTxSig) {
        logger.info("No previous transactions found, skipping gap fill");
        return { message: "No gap fill needed", error: undefined };
      }

      // Get new transactions since the last processed one
      const signatures = await this.getNewTransactions(watcher.latestTxSig);
      logger.info(`Found ${signatures.length} new transactions to process`);

      if (signatures.length === 0) {
        return { message: "No new transactions found", error: undefined };
      }

      // Process new transactions
      await this.processTransactions(signatures, { reprocess: false });

      const endTime = performance.now();
      const message = `Gap fill complete - processed ${signatures.length} transactions in ${(endTime - startTime) / 1000} seconds`;
      logger.info(message);

      return { message, error: undefined };
    } catch (error) {
      logger.error({ error }, "Gap fill failed");
      return { message: "Gap fill failed", error: error as Error };
    } finally {
      this.isRunning = false;
    }
  }

  private async initializeTransactionWatcher() {
    const existing = await db.select()
      .from(transactionWatchers)
      .where(eq(transactionWatchers.acct, OMNIPAIR_PROGRAM_ID.toString()));

    if (existing.length === 0) {
      await db.insert(transactionWatchers).values({
        acct: OMNIPAIR_PROGRAM_ID.toString(),
        checkedUpToSlot: "0",
        description: "Omnipair program transaction watcher",
        status: TransactionWatchStatus.ACTIVE,
      });
      logger.info("Initialized transaction watcher");
    }
  }

  private async getTransactionWatcher() {
    const watchers = await db.select()
      .from(transactionWatchers)
      .where(eq(transactionWatchers.acct, OMNIPAIR_PROGRAM_ID.toString()));
    
    return watchers[0] || null;
  }

  private async getTransactionHistory(options: BackfillOptions): Promise<ConfirmedSignatureInfo[]> {
    const history: ConfirmedSignatureInfo[] = [];
    const watcher = await this.getTransactionWatcher();
    
    let latestSig: string | undefined;
    let earliestSig: string | undefined;

    // If not reprocessing, start from the latest processed transaction
    if (!options.reprocess && watcher?.latestTxSig) {
      latestSig = watcher.latestTxSig;
      logger.info("Resuming from latest processed transaction", { latestSig });
    }

    let page = 1;
    const batchSize = options.batchSize || 1000;

    // Walk backwards through transaction history
    while (true) {
      const rpcOptions: SignaturesForAddressOptions = {
        limit: batchSize,
        until: latestSig,
      };

      if (earliestSig) {
        rpcOptions.before = earliestSig;
      }

      const transactions = await connection.getSignaturesForAddress(
        OMNIPAIR_PROGRAM_ID,
        rpcOptions,
        "confirmed"
      );

      if (transactions.length === 0) {
        break;
      }

      let reachedLatest = false;
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];

        // Check slot range if specified
        if (options.fromSlot && tx.slot < options.fromSlot) {
          logger.info("Reached fromSlot limit", { slot: tx.slot, fromSlot: options.fromSlot });
          reachedLatest = true;
          break;
        }

        if (options.toSlot && tx.slot > options.toSlot) {
          continue; // Skip transactions after toSlot
        }

        if (tx.signature === latestSig) {
          logger.info("Reached latest transaction");
          reachedLatest = true;
          break;
        }

        history.push(tx);
        earliestSig = tx.signature;
      }

      logger.info(`Page ${page} for ${OMNIPAIR_PROGRAM_ID.toBase58()} (${history.length} total)`);
      page++;

      if (reachedLatest) {
        break;
      }

      // Rate limiting
      await delay(100);
    }

    // Reverse to get chronological order (oldest first)
    history.reverse();
    return history;
  }

  private async getNewTransactions(fromSignature: string): Promise<ConfirmedSignatureInfo[]> {
    const signatures: ConfirmedSignatureInfo[] = [];
    let before: string | undefined;

    while (true) {
      const options: SignaturesForAddressOptions = {
        limit: 1000,
        until: fromSignature,
      };

      if (before) {
        options.before = before;
      }

      const transactions = await connection.getSignaturesForAddress(
        OMNIPAIR_PROGRAM_ID,
        options,
        "confirmed"
      );

      if (transactions.length === 0) {
        break;
      }

      let foundFromSignature = false;
      for (const tx of transactions) {
        if (tx.signature === fromSignature) {
          foundFromSignature = true;
          break;
        }
        signatures.push(tx);
      }

      if (foundFromSignature || transactions.length < 1000) {
        break;
      }

      before = transactions[transactions.length - 1].signature;
      await delay(100); // Rate limiting
    }

    return signatures;
  }

  private async processTransactions(
    signatures: ConfirmedSignatureInfo[],
    options: BackfillOptions
  ) {
    const tasks = signatures.map(signature => 
      limit(async () => {
        try {
          await this.processTransaction(signature, options.reprocess || false);
          await delay(100); // Rate limiting between transactions
        } catch (error) {
          logger.error({ error, signature: signature.signature }, "Failed to process transaction");
        }
      })
    );

    await Promise.all(tasks);
  }

  private async processTransaction(
    signature: ConfirmedSignatureInfo,
    reprocess: boolean
  ) {
    try {
      // Get transaction details
      const tx = await connection.getTransaction(signature.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        logger.warn({ signature: signature.signature }, "Transaction not found");
        return;
      }

      // Parse events from transaction logs
      console.log(`[Backfill] Processing transaction ${signature.signature}`);
      console.log(`[Backfill] Transaction logs:`, tx.meta?.logMessages || []);
      
      const events = logParser.parseLogs(tx.meta?.logMessages || [], OMNIPAIR_PROGRAM_ID);
      
      if (events.length === 0) {
        console.log(`[Backfill] No Omnipair events found in transaction ${signature.signature}`);
        logger.debug({ signature: signature.signature }, "No Omnipair events found");
        return;
      }

      console.log(`[Backfill] Found ${events.length} events in transaction ${signature.signature}:`, events);

      // Extract transaction info
      const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date();
      const slot = tx.slot;
      
      // Determine pair and user from events
      const pairAddress = this.extractPairAddress(events);
      const userAddress = this.extractUserAddress(events);
      
      if (!pairAddress || !userAddress) {
        logger.warn({ signature: signature.signature, events }, "Could not extract pair or user address");
        return;
      }

      // Process the transaction
      await transactionProcessor.processTransaction(
        signature.signature,
        blockTime,
        slot,
        pairAddress,
        userAddress,
        events
      );

      // Update transaction watcher
      await this.updateTransactionWatcher(signature);

      logger.debug({ signature: signature.signature }, "Transaction processed successfully");
    } catch (error) {
      logger.error({ error, signature: signature.signature }, "Error processing transaction");
      throw error;
    }
  }

  private extractPairAddress(events: any[]): string | null {
    for (const event of events) {
      if ('pair' in event && event.pair) {
        return event.pair;
      }
    }
    return null;
  }

  private extractUserAddress(events: any[]): string | null {
    for (const event of events) {
      if ('user' in event && event.user) {
        return event.user;
      }
    }
    return null;
  }

  private async updateTransactionWatcher(signature: ConfirmedSignatureInfo) {
    try {
      await db.update(transactionWatchers)
        .set({
          latestTxSig: signature.signature,
          checkedUpToSlot: signature.slot.toString(),
          updatedAt: new Date(),
        })
        .where(eq(transactionWatchers.acct, OMNIPAIR_PROGRAM_ID.toString()));
    } catch (error) {
      logger.error({ error, signature: signature.signature }, "Error updating transaction watcher");
    }
  }
}

export const omnipairBackfiller = new OmnipairBackfiller();

