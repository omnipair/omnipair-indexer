CREATE TYPE "public"."source" AS ENUM('spot_swap', 'oracle', 'aggregated');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('swap', 'borrow', 'repay', 'add_collateral', 'remove_collateral', 'add_liquidity', 'remove_liquidity', 'liquidate');--> statement-breakpoint
CREATE TYPE "public"."watch_status" AS ENUM('active', 'failed', 'disabled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "liquidations" (
	"liquidation_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"position_address" varchar(44) NOT NULL,
	"user_address" varchar(44) NOT NULL,
	"pair_address" varchar(44) NOT NULL,
	"liquidator_address" varchar(44) NOT NULL,
	"collateral0_liquidated" bigint NOT NULL,
	"collateral1_liquidated" bigint NOT NULL,
	"debt0_liquidated" bigint NOT NULL,
	"debt1_liquidated" bigint NOT NULL,
	"collateral_price" bigint NOT NULL,
	"liquidation_bonus_applied" bigint NOT NULL,
	"k0" numeric NOT NULL,
	"k1" numeric NOT NULL,
	"tx_signature" varchar(88) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "liquidity_events" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"pair_address" varchar(44) NOT NULL,
	"user_address" varchar(44) NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"amount0" bigint NOT NULL,
	"amount1" bigint NOT NULL,
	"liquidity" bigint NOT NULL,
	"tx_signature" varchar(88) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_state" (
	"time" timestamp with time zone NOT NULL,
	"pair_address" varchar(44) NOT NULL,
	"reserve0" bigint NOT NULL,
	"reserve1" bigint NOT NULL,
	"total_supply" bigint NOT NULL,
	"price0_ema" bigint NOT NULL,
	"price1_ema" bigint NOT NULL,
	"rate0" bigint NOT NULL,
	"rate1" bigint NOT NULL,
	"total_debt0" bigint NOT NULL,
	"total_debt1" bigint NOT NULL,
	"total_debt0_shares" bigint NOT NULL,
	"total_debt1_shares" bigint NOT NULL,
	"total_collateral0" bigint NOT NULL,
	"total_collateral1" bigint NOT NULL,
	"tvl_usd" numeric,
	"volume_24h_usd" numeric,
	"tx_signature" varchar(88) NOT NULL,
	CONSTRAINT "market_state_time_pair_address_pk" PRIMARY KEY("time","pair_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pairs" (
	"pair_address" varchar(44) PRIMARY KEY NOT NULL,
	"token0_address" varchar(44) NOT NULL,
	"token1_address" varchar(44) NOT NULL,
	"token0_decimals" smallint NOT NULL,
	"token1_decimals" smallint NOT NULL,
	"config_address" varchar(44) NOT NULL,
	"rate_model_address" varchar(44) NOT NULL,
	"swap_fee_bps" integer NOT NULL,
	"half_life" bigint NOT NULL,
	"pool_deployer_fee_bps" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_feeds" (
	"time" timestamp with time zone NOT NULL,
	"pair_address" varchar(44) NOT NULL,
	"price0" numeric NOT NULL,
	"price1" numeric NOT NULL,
	"volume_24h" numeric,
	"tx_count_24h" integer,
	"source" "source" DEFAULT 'spot_swap' NOT NULL,
	CONSTRAINT "price_feeds_time_pair_address_pk" PRIMARY KEY("time","pair_address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_details" (
	"time" timestamp with time zone NOT NULL,
	"tx_signature" varchar(88) NOT NULL,
	"pair_address" varchar(44) NOT NULL,
	"user_address" varchar(44) NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"amount0_in" bigint DEFAULT 0,
	"amount1_in" bigint DEFAULT 0,
	"amount0_out" bigint DEFAULT 0,
	"amount1_out" bigint DEFAULT 0,
	"swap_fee_amount0" bigint,
	"swap_fee_amount1" bigint,
	"collateral_change0" bigint,
	"collateral_change1" bigint,
	"debt_change0" bigint,
	"debt_change1" bigint,
	"liquidity_change" bigint,
	"liquidator_address" varchar(44),
	"liquidation_bonus" bigint,
	"price0" numeric,
	"price1" numeric,
	"volume_usd" numeric,
	"fees_usd" numeric,
	"event_data" jsonb,
	CONSTRAINT "transaction_details_time_tx_signature_pk" PRIMARY KEY("time","tx_signature")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_watchers" (
	"acct" varchar(44) PRIMARY KEY NOT NULL,
	"latest_tx_sig" varchar(88),
	"first_tx_sig" varchar(88),
	"checked_up_to_slot" numeric NOT NULL,
	"description" text NOT NULL,
	"status" "watch_status" DEFAULT 'disabled' NOT NULL,
	"failure_log" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"tx_signature" varchar(88) PRIMARY KEY NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"slot" numeric NOT NULL,
	"pair_address" varchar(44) NOT NULL,
	"user_address" varchar(44) NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"status" "status" DEFAULT 'success' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_positions" (
	"position_address" varchar(44) PRIMARY KEY NOT NULL,
	"user_address" varchar(44) NOT NULL,
	"pair_address" varchar(44) NOT NULL,
	"collateral0_amount" bigint DEFAULT 0 NOT NULL,
	"collateral1_amount" bigint DEFAULT 0 NOT NULL,
	"debt0_shares" bigint DEFAULT 0 NOT NULL,
	"debt1_shares" bigint DEFAULT 0 NOT NULL,
	"collateral0_applied_min_cf_bps" integer DEFAULT 0 NOT NULL,
	"collateral1_applied_min_cf_bps" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "liquidations" ADD CONSTRAINT "liquidations_position_address_user_positions_position_address_fk" FOREIGN KEY ("position_address") REFERENCES "public"."user_positions"("position_address") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "liquidations" ADD CONSTRAINT "liquidations_pair_address_pairs_pair_address_fk" FOREIGN KEY ("pair_address") REFERENCES "public"."pairs"("pair_address") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "liquidity_events" ADD CONSTRAINT "liquidity_events_pair_address_pairs_pair_address_fk" FOREIGN KEY ("pair_address") REFERENCES "public"."pairs"("pair_address") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watchers" ADD CONSTRAINT "transaction_watchers_latest_tx_sig_transactions_tx_signature_fk" FOREIGN KEY ("latest_tx_sig") REFERENCES "public"."transactions"("tx_signature") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transaction_watchers" ADD CONSTRAINT "transaction_watchers_first_tx_sig_transactions_tx_signature_fk" FOREIGN KEY ("first_tx_sig") REFERENCES "public"."transactions"("tx_signature") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_pair_address_pairs_pair_address_fk" FOREIGN KEY ("pair_address") REFERENCES "public"."pairs"("pair_address") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_positions" ADD CONSTRAINT "user_positions_pair_address_pairs_pair_address_fk" FOREIGN KEY ("pair_address") REFERENCES "public"."pairs"("pair_address") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_details_pair_time_index" ON "transaction_details" USING btree ("pair_address","time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_details_user_time_index" ON "transaction_details" USING btree ("user_address","time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_slot_index" ON "transactions" USING btree ("slot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_pair_index" ON "transactions" USING btree ("pair_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "txn_user_index" ON "transactions" USING btree ("user_address");--> statement-breakpoint
CREATE VIEW "public"."user_positions_analytics" AS (select "user_positions"."position_address", "user_positions"."user_address", "user_positions"."pair_address", "pairs"."token0_address", "pairs"."token1_address", "user_positions"."collateral0_amount", "user_positions"."collateral1_amount", "user_positions"."debt0_shares", "user_positions"."debt1_shares", 0 as "collateral_value", 0 as "debt_value", 0 as "health_factor" from "user_positions" left join "pairs" on "user_positions"."pair_address" = "pairs"."pair_address");