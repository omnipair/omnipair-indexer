import { z } from "zod";

// Base event schema
export const BaseEvent = z.object({
  user: z.string(),
  timestamp: z.number(),
});

// Swap Event
export const SwapEvent = BaseEvent.extend({
  type: z.literal("SwapEvent"),
  amount0_in: z.bigint(),
  amount1_in: z.bigint(),
  amount0_out: z.bigint(),
  amount1_out: z.bigint(),
});

// Adjust Collateral Event
export const AdjustCollateralEvent = BaseEvent.extend({
  type: z.literal("AdjustCollateralEvent"),
  amount0: z.bigint(),
  amount1: z.bigint(),
});

// Adjust Debt Event
export const AdjustDebtEvent = BaseEvent.extend({
  type: z.literal("AdjustDebtEvent"),
  amount0: z.bigint(),
  amount1: z.bigint(),
});

// Pair Created Event
export const PairCreatedEvent = z.object({
  type: z.literal("PairCreatedEvent"),
  token0: z.string(),
  token1: z.string(),
  pair: z.string(),
  timestamp: z.number(),
});

// Adjust Liquidity Event
export const AdjustLiquidityEvent = BaseEvent.extend({
  type: z.literal("AdjustLiquidityEvent"),
  amount0: z.bigint(),
  amount1: z.bigint(),
  liquidity: z.bigint(),
});

// Burn Event
export const BurnEvent = BaseEvent.extend({
  type: z.literal("BurnEvent"),
  amount0: z.bigint(),
  amount1: z.bigint(),
  liquidity: z.bigint(),
});

// Mint Event
export const MintEvent = BaseEvent.extend({
  type: z.literal("MintEvent"),
  amount0: z.bigint(),
  amount1: z.bigint(),
  liquidity: z.bigint(),
});

// Update Pair Event
export const UpdatePairEvent = z.object({
  type: z.literal("UpdatePairEvent"),
  price0_ema: z.bigint(),
  price1_ema: z.bigint(),
  rate0: z.bigint(),
  rate1: z.bigint(),
  timestamp: z.number(),
});

// User Position Created Event
export const UserPositionCreatedEvent = BaseEvent.extend({
  type: z.literal("UserPositionCreatedEvent"),
  pair: z.string(),
  position: z.string(),
});

// User Position Updated Event
export const UserPositionUpdatedEvent = BaseEvent.extend({
  type: z.literal("UserPositionUpdatedEvent"),
  pair: z.string(),
  position: z.string(),
  collateral0: z.bigint(),
  collateral1: z.bigint(),
  debt0_shares: z.bigint(),
  debt1_shares: z.bigint(),
});

// User Position Liquidated Event
export const UserPositionLiquidatedEvent = BaseEvent.extend({
  type: z.literal("UserPositionLiquidatedEvent"),
  pair: z.string(),
  position: z.string(),
  liquidator: z.string(),
  collateral0_liquidated: z.bigint(),
  collateral1_liquidated: z.bigint(),
  debt0_liquidated: z.bigint(),
  debt1_liquidated: z.bigint(),
  collateral_price: z.bigint(),
  liquidation_bonus_applied: z.bigint(),
  k0: z.bigint(),
  k1: z.bigint(),
});

// Union of all events
export const OmnipairEvent = z.discriminatedUnion("type", [
  SwapEvent,
  AdjustCollateralEvent,
  AdjustDebtEvent,
  PairCreatedEvent,
  AdjustLiquidityEvent,
  BurnEvent,
  MintEvent,
  UpdatePairEvent,
  UserPositionCreatedEvent,
  UserPositionUpdatedEvent,
  UserPositionLiquidatedEvent,
]);

// Type exports
export type SwapEventType = z.infer<typeof SwapEvent>;
export type AdjustCollateralEventType = z.infer<typeof AdjustCollateralEvent>;
export type AdjustDebtEventType = z.infer<typeof AdjustDebtEvent>;
export type PairCreatedEventType = z.infer<typeof PairCreatedEvent>;
export type AdjustLiquidityEventType = z.infer<typeof AdjustLiquidityEvent>;
export type BurnEventType = z.infer<typeof BurnEvent>;
export type MintEventType = z.infer<typeof MintEvent>;
export type UpdatePairEventType = z.infer<typeof UpdatePairEvent>;
export type UserPositionCreatedEventType = z.infer<typeof UserPositionCreatedEvent>;
export type UserPositionUpdatedEventType = z.infer<typeof UserPositionUpdatedEvent>;
export type UserPositionLiquidatedEventType = z.infer<typeof UserPositionLiquidatedEvent>;
export type OmnipairEventType = z.infer<typeof OmnipairEvent>;

// Transaction type mapping
export const getTransactionTypeFromEvent = (event: OmnipairEventType): string => {
  switch (event.type) {
    case "SwapEvent":
      return "swap";
    case "AdjustDebtEvent":
      return event.amount0 > 0n || event.amount1 > 0n ? "borrow" : "repay";
    case "AdjustCollateralEvent":
      return event.amount0 > 0n || event.amount1 > 0n ? "add_collateral" : "remove_collateral";
    case "AdjustLiquidityEvent":
      return event.amount0 > 0n || event.amount1 > 0n ? "add_liquidity" : "remove_liquidity";
    case "MintEvent":
      return "add_liquidity";
    case "BurnEvent":
      return "remove_liquidity";
    case "UserPositionLiquidatedEvent":
      return "liquidate";
    default:
      return "unknown";
  }
};

