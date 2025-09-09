import { log } from "../logger/logger";
import { connection } from "../connection";
import { PublicKey } from "@solana/web3.js";
import { CronJob } from "cron";
import { logParser } from "./processors/logParser";
import { transactionProcessor } from "./processors/transactionProcessor";
import { omnipairBackfiller, BackfillOptions } from "./backfill";

const logger = log.child({
  module: "omnipair_indexer"
});

// Omnipair program ID (from the Rust program)
const OMNIPAIR_PROGRAM_ID = new PublicKey("3tJrAXnjofAw8oskbMaSo9oMAYuzdBgVbW3TvQLdMEBd");

class OmnipairIndexer {
  private isRunning = false;
  private subscriptionId: number | null = null;

  async start(options: { skipBackfill?: boolean, backfillFromSlot?: number } = {}) {
    if (this.isRunning) {
      logger.warn("Indexer is already running");
      return;
    }

    logger.info("Starting Omnipair indexer...", options);
    this.isRunning = true;

    try {
      // Run initial backfill if not skipped
      if (!options.skipBackfill) {
        logger.info("Running initial backfill...");
        const backfillOptions: BackfillOptions = {};
        if (options.backfillFromSlot) {
          backfillOptions.fromSlot = options.backfillFromSlot;
        }
        
        const result = await omnipairBackfiller.backfill(backfillOptions);
        if (result.error) {
          logger.error({ error: result.error }, "Initial backfill failed");
        } else {
          logger.info(result.message);
        }
      }

      // Start monitoring Omnipair program logs
      await this.startLogMonitoring();
      
      // Start periodic tasks
      this.startPeriodicTasks();
      
      logger.info("Omnipair indexer started successfully");
    } catch (error) {
      logger.error({ error }, "Failed to start indexer");
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      logger.warn("Indexer is not running");
      return;
    }

    logger.info("Stopping Omnipair indexer...");
    this.isRunning = false;

    if (this.subscriptionId !== null) {
      await connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }

    logger.info("Omnipair indexer stopped");
  }

  private async startLogMonitoring() {
    logger.info("Starting log monitoring for Omnipair program...");
    
    this.subscriptionId = connection.onLogs(
      OMNIPAIR_PROGRAM_ID,
      async (logs, context) => {
        try {
          await this.processLogs(logs, context);
        } catch (error) {
          logger.error({ error, logs, context }, "Error processing logs");
        }
      },
      "confirmed"
    );

    logger.info("Log monitoring started");
  }

  private async processLogs(logs: any, context: any) {
    logger.debug({ logs, context }, "Processing logs");
    
    try {
      // Parse events from logs
      const events = logParser.parseLogs(logs.logs, OMNIPAIR_PROGRAM_ID);
      
      if (events.length === 0) {
        logger.debug("No Omnipair events found in logs");
        return;
      }

      // Extract transaction info
      const txSignature = logs.signature;
      const blockTime = new Date(context.blockTime * 1000);
      const slot = context.slot;
      
      // Determine pair and user from events
      const pairAddress = this.extractPairAddress(events);
      const userAddress = this.extractUserAddress(events);
      
      if (!pairAddress || !userAddress) {
        logger.warn({ events }, "Could not extract pair or user address from events");
        return;
      }

      // Process the transaction
      await transactionProcessor.processTransaction(
        txSignature,
        blockTime,
        slot,
        pairAddress,
        userAddress,
        events
      );

      logger.debug({ txSignature, eventCount: events.length }, "Successfully processed transaction");
    } catch (error) {
      logger.error({ error, logs, context }, "Error processing logs");
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

  private startPeriodicTasks() {
    logger.info("Starting periodic tasks...");

    // Gap fill every 5 minutes to catch any missed transactions
    new CronJob("*/5 * * * *", async () => {
      try {
        const result = await omnipairBackfiller.gapFill();
        if (result.error) {
          logger.error({ error: result.error }, "Gap fill failed");
        } else {
          logger.debug(result.message);
        }
      } catch (error) {
        logger.error({ error }, "Error during gap fill");
      }
    }).start();

    // Market state snapshot every 5 minutes
    new CronJob("*/5 * * * *", async () => {
      try {
        await this.captureMarketStateSnapshot();
      } catch (error) {
        logger.error({ error }, "Error capturing market state snapshot");
      }
    }).start();

    // Price feed update every minute
    new CronJob("* * * * *", async () => {
      try {
        await this.updatePriceFeeds();
      } catch (error) {
        logger.error({ error }, "Error updating price feeds");
      }
    }).start();

    // Health check every 10 minutes
    new CronJob("*/10 * * * *", async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error({ error }, "Error performing health check");
      }
    }).start();

    logger.info("Periodic tasks started");
  }

  private async captureMarketStateSnapshot() {
    logger.debug("Capturing market state snapshot...");
    // TODO: Implement market state snapshot
  }

  private async updatePriceFeeds() {
    logger.debug("Updating price feeds...");
    // TODO: Implement price feed updates
  }

  private async performHealthCheck() {
    logger.debug("Performing health check...");
    // TODO: Implement health checks
  }

  // Public methods for manual operations
  async runBackfill(options: BackfillOptions = {}) {
    logger.info("Running manual backfill...", options);
    return await omnipairBackfiller.backfill(options);
  }

  async runGapFill() {
    logger.info("Running manual gap fill...");
    return await omnipairBackfiller.gapFill();
  }

  async backfillFromSlot(slot: number) {
    logger.info(`Running backfill from slot ${slot}...`);
    return await omnipairBackfiller.backfill({ fromSlot: slot });
  }

  async backfillRange(fromSlot: number, toSlot: number) {
    logger.info(`Running backfill from slot ${fromSlot} to ${toSlot}...`);
    return await omnipairBackfiller.backfill({ fromSlot, toSlot });
  }
}

// Export singleton instance
export const omnipairIndexer = new OmnipairIndexer();
