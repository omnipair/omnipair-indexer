import { log } from "../../logger/logger";
import { OmnipairEvent, OmnipairEventType } from "../events";
import { PublicKey } from "@solana/web3.js";

const logger = log.child({
  module: "log_parser"
});

export class LogParser {
  private readonly OMNIPAIR_PROGRAM_ID = new PublicKey("3tJrAXnjofAw8oskbMaSo9oMAYuzdBgVbW3TvQLdMEBd");
  
  // Event discriminators (32 bytes of the event data)
  private readonly EVENT_DISCRIMINATORS = {
    "SwapEvent": Buffer.from("e445a52e51cb9a1d40c6cde8260871e2", "hex"),
    "AdjustCollateralEvent": Buffer.from("e445a52e51cb9a1d63f6437e2cfcc121", "hex"),
    "AdjustDebtEvent": Buffer.from("", "hex"), // Need to find this one
    "PairCreatedEvent": Buffer.from("", "hex"), // Need to find this one
    "AdjustLiquidityEvent": Buffer.from("e445a52e51cb9a1de5a2d3279ffb184e", "hex"),
    "BurnEvent": Buffer.from("e445a52e51cb9a1d21592f75527ceefa", "hex"),
    "MintEvent": Buffer.from("e445a52e51cb9a1dc590929542a45f10", "hex"),
    "UpdatePairEvent": Buffer.from("", "hex"), // Need to find this one
    "UserPositionCreatedEvent": Buffer.from("", "hex"), // Need to find this one
    "UserPositionUpdatedEvent": Buffer.from("", "hex"), // Need to find this one
    "UserPositionLiquidatedEvent": Buffer.from("", "hex"), // Need to find this one
  };

  parseLogs(logs: string[], programId: PublicKey): OmnipairEventType[] {
    const events: OmnipairEventType[] = [];

    console.log(`[LogParser] Parsing ${logs.length} log lines for program ${programId.toBase58()}`);

    for (const logLine of logs) {
      try {
        // Check if this log is from our program
        if (!logLine.includes(programId.toBase58())) {
          continue;
        }

        console.log(`[LogParser] Found log from our program: ${logLine}`);

        // Look for "Program data:" logs which contain Anchor events
        if (logLine.includes("Program data:")) {
          console.log(`[LogParser] Found Program data log: ${logLine}`);
          const event = this.parseAnchorEvent(logLine);
          if (event) {
            console.log(`[LogParser] Successfully parsed event:`, event);
            events.push(event);
          } else {
            console.log(`[LogParser] Failed to parse event from log: ${logLine}`);
          }
        }
      } catch (error) {
        console.log(`[LogParser] Error parsing log line: ${logLine}`, error);
        logger.debug({ error, logLine }, "Failed to parse log line");
      }
    }

    console.log(`[LogParser] Total events found: ${events.length}`);
    return events;
  }

  private parseAnchorEvent(logLine: string): OmnipairEventType | null {
    try {
      // Extract the base64 encoded data from "Program data: <base64>"
      const dataMatch = logLine.match(/Program data: (.+)/);
      if (!dataMatch) {
        return null;
      }

      const base64Data = dataMatch[1];
      const eventData = Buffer.from(base64Data, "base64");

      // Check if we have enough data for a discriminator (32 bytes)
      if (eventData.length < 32) {
        return null;
      }

      // Extract discriminator (first 32 bytes)
      const discriminator = eventData.slice(0, 32);
      console.log(`[LogParser] Found discriminator: ${discriminator.toString("hex")}`);
      console.log(`[LogParser] Event data length: ${eventData.length} bytes`);
      
      // Find matching event type
      for (const [eventName, expectedDiscriminator] of Object.entries(this.EVENT_DISCRIMINATORS)) {
        if (expectedDiscriminator.length > 0 && discriminator.equals(expectedDiscriminator)) {
          console.log(`[LogParser] Matched discriminator for ${eventName}`);
          return this.decodeEvent(eventName, eventData.slice(32));
        }
      }

      console.log(`[LogParser] Unknown event discriminator: ${discriminator.toString("hex")}`);
      logger.debug({ discriminator: discriminator.toString("hex") }, "Unknown event discriminator");
      return null;
    } catch (error) {
      logger.debug({ error, logLine }, "Failed to parse Anchor event");
      return null;
    }
  }

  private decodeEvent(eventName: string, data: Buffer): OmnipairEventType | null {
    try {
      switch (eventName) {
        case "SwapEvent":
          return this.decodeSwapEvent(data);
        case "AdjustCollateralEvent":
          return this.decodeAdjustCollateralEvent(data);
        case "AdjustDebtEvent":
          return this.decodeAdjustDebtEvent(data);
        case "PairCreatedEvent":
          return this.decodePairCreatedEvent(data);
        case "AdjustLiquidityEvent":
          return this.decodeAdjustLiquidityEvent(data);
        case "BurnEvent":
          return this.decodeBurnEvent(data);
        case "MintEvent":
          return this.decodeMintEvent(data);
        case "UpdatePairEvent":
          return this.decodeUpdatePairEvent(data);
        case "UserPositionCreatedEvent":
          return this.decodeUserPositionCreatedEvent(data);
        case "UserPositionUpdatedEvent":
          return this.decodeUserPositionUpdatedEvent(data);
        case "UserPositionLiquidatedEvent":
          return this.decodeUserPositionLiquidatedEvent(data);
        default:
          logger.debug({ eventName }, "Unknown event type");
          return null;
      }
    } catch (error) {
      logger.debug({ error, eventName }, "Failed to decode event");
      return null;
    }
  }

  private decodeSwapEvent(data: Buffer): OmnipairEventType | null {
    try {
      // SwapEvent structure: user (32 bytes) + amount0_in (8 bytes) + amount1_in (8 bytes) + amount0_out (8 bytes) + amount1_out (8 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const amount0_in = data.readBigUInt64LE(offset);
      offset += 8;
      
      const amount1_in = data.readBigUInt64LE(offset);
      offset += 8;
      
      const amount0_out = data.readBigUInt64LE(offset);
      offset += 8;
      
      const amount1_out = data.readBigUInt64LE(offset);
      offset += 8;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "SwapEvent",
        user: user.toBase58(),
        amount0_in: amount0_in.toString(),
        amount1_in: amount1_in.toString(),
        amount0_out: amount0_out.toString(),
        amount1_out: amount1_out.toString(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode SwapEvent");
      return null;
    }
  }

  private decodeAdjustCollateralEvent(data: Buffer): OmnipairEventType | null {
    try {
      // AdjustCollateralEvent structure: user (32 bytes) + amount0 (8 bytes) + amount1 (8 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const amount0 = data.readBigInt64LE(offset);
      offset += 8;
      
      const amount1 = data.readBigInt64LE(offset);
      offset += 8;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "AdjustCollateralEvent",
        user: user.toBase58(),
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode AdjustCollateralEvent");
      return null;
    }
  }

  private decodeAdjustDebtEvent(data: Buffer): OmnipairEventType | null {
    try {
      // AdjustDebtEvent structure: user (32 bytes) + amount0 (8 bytes) + amount1 (8 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const amount0 = data.readBigInt64LE(offset);
      offset += 8;
      
      const amount1 = data.readBigInt64LE(offset);
      offset += 8;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "AdjustDebtEvent",
        user: user.toBase58(),
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode AdjustDebtEvent");
      return null;
    }
  }

  private decodePairCreatedEvent(data: Buffer): OmnipairEventType | null {
    try {
      // PairCreatedEvent structure: token0 (32 bytes) + token1 (32 bytes) + pair (32 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const token0 = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const token1 = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const pair = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "PairCreatedEvent",
        token0: token0.toBase58(),
        token1: token1.toBase58(),
        pair: pair.toBase58(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode PairCreatedEvent");
      return null;
    }
  }

  private decodeAdjustLiquidityEvent(data: Buffer): OmnipairEventType | null {
    try {
      // AdjustLiquidityEvent structure: user (32 bytes) + amount0 (8 bytes) + amount1 (8 bytes) + liquidity (8 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const amount0 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const amount1 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const liquidity = data.readBigUInt64LE(offset);
      offset += 8;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "AdjustLiquidityEvent",
        user: user.toBase58(),
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        liquidity: liquidity.toString(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode AdjustLiquidityEvent");
      return null;
    }
  }

  private decodeBurnEvent(data: Buffer): OmnipairEventType | null {
    try {
      // BurnEvent structure: user (32 bytes) + amount0 (8 bytes) + amount1 (8 bytes) + liquidity (8 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const amount0 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const amount1 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const liquidity = data.readBigUInt64LE(offset);
      offset += 8;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "BurnEvent",
        user: user.toBase58(),
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        liquidity: liquidity.toString(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode BurnEvent");
      return null;
    }
  }

  private decodeMintEvent(data: Buffer): OmnipairEventType | null {
    try {
      // MintEvent structure: user (32 bytes) + amount0 (8 bytes) + amount1 (8 bytes) + liquidity (8 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const amount0 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const amount1 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const liquidity = data.readBigUInt64LE(offset);
      offset += 8;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "MintEvent",
        user: user.toBase58(),
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        liquidity: liquidity.toString(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode MintEvent");
      return null;
    }
  }

  private decodeUpdatePairEvent(data: Buffer): OmnipairEventType | null {
    try {
      // UpdatePairEvent structure: price0_ema (8 bytes) + price1_ema (8 bytes) + rate0 (8 bytes) + rate1 (8 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const price0_ema = data.readBigUInt64LE(offset);
      offset += 8;
      
      const price1_ema = data.readBigUInt64LE(offset);
      offset += 8;
      
      const rate0 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const rate1 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "UpdatePairEvent",
        price0_ema: price0_ema.toString(),
        price1_ema: price1_ema.toString(),
        rate0: rate0.toString(),
        rate1: rate1.toString(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode UpdatePairEvent");
      return null;
    }
  }

  private decodeUserPositionCreatedEvent(data: Buffer): OmnipairEventType | null {
    try {
      // UserPositionCreatedEvent structure: user (32 bytes) + pair (32 bytes) + position (32 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const pair = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const position = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "UserPositionCreatedEvent",
        user: user.toBase58(),
        pair: pair.toBase58(),
        position: position.toBase58(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode UserPositionCreatedEvent");
      return null;
    }
  }

  private decodeUserPositionUpdatedEvent(data: Buffer): OmnipairEventType | null {
    try {
      // UserPositionUpdatedEvent structure: user (32 bytes) + pair (32 bytes) + position (32 bytes) + collateral0 (8 bytes) + collateral1 (8 bytes) + debt0_shares (8 bytes) + debt1_shares (8 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const pair = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const position = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const collateral0 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const collateral1 = data.readBigUInt64LE(offset);
      offset += 8;
      
      const debt0_shares = data.readBigUInt64LE(offset);
      offset += 8;
      
      const debt1_shares = data.readBigUInt64LE(offset);
      offset += 8;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "UserPositionUpdatedEvent",
        user: user.toBase58(),
        pair: pair.toBase58(),
        position: position.toBase58(),
        collateral0: collateral0.toString(),
        collateral1: collateral1.toString(),
        debt0_shares: debt0_shares.toString(),
        debt1_shares: debt1_shares.toString(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode UserPositionUpdatedEvent");
      return null;
    }
  }

  private decodeUserPositionLiquidatedEvent(data: Buffer): OmnipairEventType | null {
    try {
      // UserPositionLiquidatedEvent structure: user (32 bytes) + pair (32 bytes) + position (32 bytes) + timestamp (8 bytes)
      let offset = 0;
      
      const user = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const pair = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const position = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const timestamp = data.readBigInt64LE(offset);
      
      return {
        type: "UserPositionLiquidatedEvent",
        user: user.toBase58(),
        pair: pair.toBase58(),
        position: position.toBase58(),
        timestamp: timestamp.toString(),
      };
    } catch (error) {
      logger.debug({ error }, "Failed to decode UserPositionLiquidatedEvent");
      return null;
    }
  }
}

export const logParser = new LogParser();