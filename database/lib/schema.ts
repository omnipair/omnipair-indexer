import { desc, SQL, sql, eq } from "drizzle-orm";
import {
  bigint,
  doublePrecision,
  integer,
  numeric,
  smallint,
  index,
  pgTable,
  primaryKey,
  unique,
  boolean,
  timestamp,
  varchar,
  text,
  jsonb,
  uuid,
  pgView,
  QueryBuilder,
  bigserial,
  pgEnum,
} from "drizzle-orm/pg-core";

// Constants for Solana addresses
const MAX_PUBKEY_B58_STR_LEN = 44;
const pubkey = (columnName: string) =>
  varchar(columnName, { length: MAX_PUBKEY_B58_STR_LEN });

const MAX_TRANSACTION_B58_STR_LEN = 88;
const transaction = (columnName: string) =>
  varchar(columnName, { length: MAX_TRANSACTION_B58_STR_LEN });

const tokenAmount = (columnName: string) =>
  bigint(columnName, { mode: "bigint" });

const biggerTokenAmount = (columnName: string) => numeric(columnName);

const block = (columnName: string) => bigint(columnName, { mode: "bigint" });
const slot = (columnName: string) => bigint(columnName, { mode: "bigint" });

const biggerBlock = (columnName: string) => numeric(columnName);
const biggerSlot = (columnName: string) => numeric(columnName);

// Enums
export enum TransactionType {
  SWAP = "swap",
  BORROW = "borrow",
  REPAY = "repay",
  ADD_COLLATERAL = "add_collateral",
  REMOVE_COLLATERAL = "remove_collateral",
  ADD_LIQUIDITY = "add_liquidity",
  REMOVE_LIQUIDITY = "remove_liquidity",
  LIQUIDATE = "liquidate",
}

export enum TransactionStatus {
  SUCCESS = "success",
  FAILED = "failed",
}

export enum PriceSource {
  SPOT_SWAP = "spot_swap",
  ORACLE = "oracle",
  AGGREGATED = "aggregated",
}

export enum TransactionWatchStatus {
  ACTIVE = "active",
  FAILED = "failed",
  DISABLED = "disabled",
}

// Define pgEnums
export const transactionTypeEnum = pgEnum("transaction_type", ["swap", "borrow", "repay", "add_collateral", "remove_collateral", "add_liquidity", "remove_liquidity", "liquidate"]);
export const transactionStatusEnum = pgEnum("status", ["success", "failed"]);
export const priceSourceEnum = pgEnum("source", ["spot_swap", "oracle", "aggregated"]);
export const transactionWatchStatusEnum = pgEnum("watch_status", ["active", "failed", "disabled"]);

// Core Tables

// Pairs table - stores Omnipair pair information
export const pairs = pgTable("pairs", {
  pairAddress: pubkey("pair_address").primaryKey(),
  token0Address: pubkey("token0_address").notNull(),
  token1Address: pubkey("token1_address").notNull(),
  token0Decimals: smallint("token0_decimals").notNull(),
  token1Decimals: smallint("token1_decimals").notNull(),
  configAddress: pubkey("config_address").notNull(),
  rateModelAddress: pubkey("rate_model_address").notNull(),
  swapFeeBps: integer("swap_fee_bps").notNull(),
  halfLife: bigint("half_life", { mode: "bigint" }).notNull(),
  poolDeployerFeeBps: integer("pool_deployer_fee_bps").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
});

// User positions table - stores current user positions
export const userPositions = pgTable("user_positions", {
  positionAddress: pubkey("position_address").primaryKey(),
  userAddress: pubkey("user_address").notNull(),
  pairAddress: pubkey("pair_address")
    .references(() => pairs.pairAddress)
    .notNull(),
  collateral0Amount: tokenAmount("collateral0_amount").notNull().default(0),
  collateral1Amount: tokenAmount("collateral1_amount").notNull().default(0),
  debt0Shares: tokenAmount("debt0_shares").notNull().default(0),
  debt1Shares: tokenAmount("debt1_shares").notNull().default(0),
  collateral0AppliedMinCfBps: integer("collateral0_applied_min_cf_bps")
    .notNull()
    .default(0),
  collateral1AppliedMinCfBps: integer("collateral1_applied_min_cf_bps")
    .notNull()
    .default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
});

// Transactions table - stores all Omnipair transactions
export const transactions = pgTable(
  "transactions",
  {
    txSignature: transaction("tx_signature").primaryKey(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
    slot: biggerSlot("slot").notNull(),
    pairAddress: pubkey("pair_address")
      .references(() => pairs.pairAddress)
      .notNull(),
    userAddress: pubkey("user_address").notNull(),
    transactionType: transactionTypeEnum("transaction_type").notNull(),
    status: transactionStatusEnum("status")
      .notNull()
      .default("success"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => ({
    slotIdx: index("txn_slot_index").on(table.slot),
    pairIdx: index("txn_pair_index").on(table.pairAddress),
    userIdx: index("txn_user_index").on(table.userAddress),
  })
);

// Transaction details table - TimescaleDB hypertable for detailed transaction data
export const transactionDetails = pgTable(
  "transaction_details",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    txSignature: transaction("tx_signature").notNull(),
    pairAddress: pubkey("pair_address").notNull(),
    userAddress: pubkey("user_address").notNull(),
    transactionType: transactionTypeEnum("transaction_type").notNull(),

    // Generic fields for all transaction types
    amount0In: tokenAmount("amount0_in").default(0),
    amount1In: tokenAmount("amount1_in").default(0),
    amount0Out: tokenAmount("amount0_out").default(0),
    amount1Out: tokenAmount("amount1_out").default(0),

    // Swap-specific fields
    swapFeeAmount0: tokenAmount("swap_fee_amount0"),
    swapFeeAmount1: tokenAmount("swap_fee_amount1"),

    // Lending-specific fields
    collateralChange0: tokenAmount("collateral_change0"),
    collateralChange1: tokenAmount("collateral_change1"),
    debtChange0: tokenAmount("debt_change0"),
    debtChange1: tokenAmount("debt_change1"),

    // Liquidity-specific fields
    liquidityChange: tokenAmount("liquidity_change"),

    // Liquidation-specific fields
    liquidatorAddress: pubkey("liquidator_address"),
    liquidationBonus: tokenAmount("liquidation_bonus"),

    // Calculated fields
    price0: biggerTokenAmount("price0"),
    price1: biggerTokenAmount("price1"),
    volumeUsd: biggerTokenAmount("volume_usd"),
    feesUsd: biggerTokenAmount("fees_usd"),

    // Metadata
    eventData: jsonb("event_data"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.time, table.txSignature] }),
    pairTimeIdx: index("txn_details_pair_time_index").on(
      table.pairAddress,
      table.time
    ),
    userTimeIdx: index("txn_details_user_time_index").on(
      table.userAddress,
      table.time
    ),
  })
);

// Price feeds table - TimescaleDB hypertable for price data
export const priceFeeds = pgTable(
  "price_feeds",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    pairAddress: pubkey("pair_address").notNull(),
    price0: biggerTokenAmount("price0").notNull(),
    price1: biggerTokenAmount("price1").notNull(),
    volume24h: biggerTokenAmount("volume_24h"),
    txCount24h: integer("tx_count_24h"),
    source: priceSourceEnum("source")
      .notNull()
      .default("spot_swap"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.time, table.pairAddress] }),
  })
);

// Liquidity events table
export const liquidityEvents = pgTable("liquidity_events", {
  eventId: uuid("event_id").primaryKey().default(sql`gen_random_uuid()`),
  time: timestamp("time", { withTimezone: true }).notNull(),
  pairAddress: pubkey("pair_address")
    .references(() => pairs.pairAddress)
    .notNull(),
  userAddress: pubkey("user_address").notNull(),
  eventType: varchar("event_type", { length: 20 }).notNull(), // 'add', 'remove', 'mint', 'burn'
  amount0: tokenAmount("amount0").notNull(),
  amount1: tokenAmount("amount1").notNull(),
  liquidity: tokenAmount("liquidity").notNull(),
  txSignature: transaction("tx_signature").notNull(),
});

// Market state table - TimescaleDB hypertable for market state snapshots
export const marketState = pgTable(
  "market_state",
  {
    time: timestamp("time", { withTimezone: true }).notNull(),
    pairAddress: pubkey("pair_address").notNull(),
    reserve0: tokenAmount("reserve0").notNull(),
    reserve1: tokenAmount("reserve1").notNull(),
    totalSupply: tokenAmount("total_supply").notNull(),
    price0Ema: tokenAmount("price0_ema").notNull(),
    price1Ema: tokenAmount("price1_ema").notNull(),
    rate0: tokenAmount("rate0").notNull(),
    rate1: tokenAmount("rate1").notNull(),
    totalDebt0: tokenAmount("total_debt0").notNull(),
    totalDebt1: tokenAmount("total_debt1").notNull(),
    totalDebt0Shares: tokenAmount("total_debt0_shares").notNull(),
    totalDebt1Shares: tokenAmount("total_debt1_shares").notNull(),
    totalCollateral0: tokenAmount("total_collateral0").notNull(),
    totalCollateral1: tokenAmount("total_collateral1").notNull(),
    tvlUsd: biggerTokenAmount("tvl_usd"),
    volume24hUsd: biggerTokenAmount("volume_24h_usd"),
    txSignature: transaction("tx_signature").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.time, table.pairAddress] }),
  })
);

// Liquidations table
export const liquidations = pgTable("liquidations", {
  liquidationId: uuid("liquidation_id").primaryKey().default(sql`gen_random_uuid()`),
  time: timestamp("time", { withTimezone: true }).notNull(),
  positionAddress: pubkey("position_address")
    .references(() => userPositions.positionAddress)
    .notNull(),
  userAddress: pubkey("user_address").notNull(),
  pairAddress: pubkey("pair_address")
    .references(() => pairs.pairAddress)
    .notNull(),
  liquidatorAddress: pubkey("liquidator_address").notNull(),
  collateral0Liquidated: tokenAmount("collateral0_liquidated").notNull(),
  collateral1Liquidated: tokenAmount("collateral1_liquidated").notNull(),
  debt0Liquidated: tokenAmount("debt0_liquidated").notNull(),
  debt1Liquidated: tokenAmount("debt1_liquidated").notNull(),
  collateralPrice: tokenAmount("collateral_price").notNull(),
  liquidationBonusApplied: tokenAmount("liquidation_bonus_applied").notNull(),
  k0: biggerTokenAmount("k0").notNull(),
  k1: biggerTokenAmount("k1").notNull(),
  txSignature: transaction("tx_signature").notNull(),
});

// Transaction watchers - for monitoring account activity
export const transactionWatchers = pgTable("transaction_watchers", {
  acct: pubkey("acct").primaryKey(),
  latestTxSig: transaction("latest_tx_sig").references(
    () => transactions.txSignature
  ),
  firstTxSig: transaction("first_tx_sig").references(
    () => transactions.txSignature
  ),
  checkedUpToSlot: biggerSlot("checked_up_to_slot").notNull(),
  description: text("description").notNull(),
  status: transactionWatchStatusEnum("status")
    .default("disabled")
    .notNull(),
  failureLog: text("failure_log"),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// Analytics Views

// User positions with calculated metrics
export const userPositionsAnalytics = pgView("user_positions_analytics").as((qb) => {
  return qb
    .select({
      positionAddress: userPositions.positionAddress,
      userAddress: userPositions.userAddress,
      pairAddress: userPositions.pairAddress,
      token0Address: pairs.token0Address,
      token1Address: pairs.token1Address,
      collateral0Amount: userPositions.collateral0Amount,
      collateral1Amount: userPositions.collateral1Amount,
      debt0Shares: userPositions.debt0Shares,
      debt1Shares: userPositions.debt1Shares,
      collateralValue: sql<bigint>`0`.as('collateral_value'), // TODO: Calculate based on current prices
      debtValue: sql<bigint>`0`.as('debt_value'), // TODO: Calculate based on current prices
      healthFactor: sql<bigint>`0`.as('health_factor'), // TODO: Calculate health factor
    })
    .from(userPositions)
    .leftJoin(pairs, eq(userPositions.pairAddress, pairs.pairAddress));
});

// Export all tables and types
export * from "./schema";

