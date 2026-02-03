-- ============================================================================
-- Omnipair Indexer Database Schema
-- ============================================================================
-- This migration creates all tables, enums, sequences, and indexes needed
-- for the Omnipair indexer. Run this on a fresh PostgreSQL database with
-- TimescaleDB extension available.
--
-- Prerequisites:
--   - PostgreSQL 14+
--   - TimescaleDB extension installed
--
-- Usage:
--   psql -U omnipair_user -d omnipair_indexer -f 001_create_schema.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ----------------------------------------------------------------------------
-- Custom ENUM Types
-- ----------------------------------------------------------------------------

CREATE TYPE liquidity_event_type AS ENUM (
    'add',
    'remove',
    'mint',
    'burn'
);

CREATE TYPE source AS ENUM (
    'spot_swap',
    'oracle',
    'aggregated'
);

CREATE TYPE status AS ENUM (
    'success',
    'failed'
);

CREATE TYPE transaction_type AS ENUM (
    'swap',
    'borrow',
    'repay',
    'add_collateral',
    'remove_collateral',
    'add_liquidity',
    'remove_liquidity',
    'liquidate'
);

CREATE TYPE watch_status AS ENUM (
    'active',
    'failed',
    'disabled'
);

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Pools table (pair metadata)
CREATE TABLE pools (
    id SERIAL PRIMARY KEY,
    pair_address VARCHAR UNIQUE,
    token0 VARCHAR,
    token1 VARCHAR,
    lp_mint VARCHAR,
    rate_model VARCHAR,
    swap_fee_bps NUMERIC,
    half_life NUMERIC,
    fixed_cf_bps NUMERIC,
    params_hash BYTEA,
    version NUMERIC
);

-- Swaps table (time-series)
CREATE TABLE swaps (
    id SERIAL,
    pair VARCHAR,
    user_address VARCHAR,
    is_token0_in BOOLEAN,
    amount_in NUMERIC,
    amount_out NUMERIC,
    reserve0 NUMERIC,
    reserve1 NUMERIC,
    "timestamp" TIMESTAMPTZ NOT NULL,
    tx_sig VARCHAR,
    slot BIGINT,
    fee_paid0 NUMERIC,
    fee_paid1 NUMERIC,
    ema_price NUMERIC,
    PRIMARY KEY ("timestamp", id),
    CONSTRAINT tx_sig UNIQUE (tx_sig, "timestamp")
);

-- Adjust liquidity table (time-series)
CREATE TABLE adjust_liquidity (
    id SERIAL,
    pair VARCHAR,
    user_address VARCHAR,
    amount0 NUMERIC,
    amount1 NUMERIC,
    liquidity NUMERIC,
    tx_sig VARCHAR,
    "timestamp" TIMESTAMPTZ NOT NULL,
    event_type liquidity_event_type,
    PRIMARY KEY (id, "timestamp"),
    CONSTRAINT adjust_liquidity_tx_sig_timestamp_key UNIQUE (tx_sig, "timestamp")
);

-- User liquidity positions table (time-series)
CREATE TABLE user_liquidity_positions (
    signer TEXT NOT NULL,
    pair TEXT NOT NULL,
    token0_mint TEXT NOT NULL,
    token1_mint TEXT NOT NULL,
    amount0 NUMERIC NOT NULL,
    amount1 NUMERIC NOT NULL,
    lp_mint TEXT NOT NULL,
    lp_amount NUMERIC NOT NULL,
    slot BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (signer, pair)
);

-- User LP position updated events table (time-series)
CREATE TABLE user_lp_position_updated_events (
    id BIGSERIAL,
    pair_address TEXT NOT NULL,
    lp_amount NUMERIC NOT NULL,
    amount0 NUMERIC NOT NULL,
    amount1 NUMERIC NOT NULL,
    signer TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, "timestamp")
);

-- User borrow positions table (latest state per pair/signer)
CREATE TABLE user_borrow_positions (
    pair TEXT NOT NULL,
    signer TEXT NOT NULL,
    "position" TEXT NOT NULL,
    collateral0 NUMERIC NOT NULL,
    collateral1 NUMERIC NOT NULL,
    debt0_shares NUMERIC NOT NULL,
    debt1_shares NUMERIC NOT NULL,
    collateral0_applied_min_cf_bps INTEGER NOT NULL,
    collateral1_applied_min_cf_bps INTEGER NOT NULL,
    slot BIGINT NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pair, signer)
);

-- User position updated events table
CREATE TABLE user_position_updated_events (
    id BIGSERIAL PRIMARY KEY,
    pair VARCHAR(44) NOT NULL,
    signer VARCHAR(44) NOT NULL,
    "position" VARCHAR(44) NOT NULL,
    collateral0 BIGINT NOT NULL,
    collateral1 BIGINT NOT NULL,
    debt0_shares BIGINT NOT NULL,
    debt1_shares BIGINT NOT NULL,
    collateral0_applied_min_cf_bps INTEGER NOT NULL,
    collateral1_applied_min_cf_bps INTEGER NOT NULL,
    transaction_signature VARCHAR(88) NOT NULL UNIQUE,
    slot BIGINT NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL
);

-- User position liquidated events table
CREATE TABLE user_position_liquidated_events (
    id BIGSERIAL PRIMARY KEY,
    pair VARCHAR(44) NOT NULL,
    signer VARCHAR(44) NOT NULL,
    "position" VARCHAR(44) NOT NULL,
    liquidator VARCHAR(44) NOT NULL,
    collateral0_liquidated BIGINT NOT NULL,
    collateral1_liquidated BIGINT NOT NULL,
    debt0_liquidated BIGINT NOT NULL,
    debt1_liquidated BIGINT NOT NULL,
    collateral_price BIGINT NOT NULL,
    shortfall NUMERIC NOT NULL,
    liquidation_bonus_applied BIGINT NOT NULL,
    k0 NUMERIC NOT NULL,
    k1 NUMERIC NOT NULL,
    transaction_signature VARCHAR(88) NOT NULL UNIQUE,
    slot BIGINT NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL
);

-- Adjust collateral events table
CREATE TABLE adjust_collateral_events (
    id BIGSERIAL PRIMARY KEY,
    pair VARCHAR(44) NOT NULL,
    signer VARCHAR(44) NOT NULL,
    amount0 BIGINT NOT NULL,
    amount1 BIGINT NOT NULL,
    transaction_signature VARCHAR(88) NOT NULL UNIQUE,
    slot BIGINT NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL
);

-- Adjust debt events table
CREATE TABLE adjust_debt_events (
    id BIGSERIAL PRIMARY KEY,
    pair VARCHAR(44) NOT NULL,
    signer VARCHAR(44) NOT NULL,
    amount0 BIGINT NOT NULL,
    amount1 BIGINT NOT NULL,
    transaction_signature VARCHAR(88) NOT NULL UNIQUE,
    slot BIGINT NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL
);

-- Leverage position created events table
CREATE TABLE leverage_position_created_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_address VARCHAR(44) NOT NULL,
    pair_address VARCHAR(44) NOT NULL,
    user_address VARCHAR(44) NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    tx_signature VARCHAR(88) NOT NULL,
    slot BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Leverage position updated events table
CREATE TABLE leverage_position_updated_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_address VARCHAR(44) NOT NULL,
    pair_address VARCHAR(44) NOT NULL,
    user_address VARCHAR(44) NOT NULL,
    long_token0 BOOLEAN NOT NULL,
    target_leverage_bps INTEGER NOT NULL,
    debt_delta BIGINT NOT NULL,
    debt_amount BIGINT NOT NULL,
    collateral_deposited BIGINT NOT NULL,
    collateral_delta BIGINT NOT NULL,
    collateral_position_size BIGINT NOT NULL,
    collateral_leverage_multiplier_bps SMALLINT NOT NULL,
    applied_cf_bps SMALLINT NOT NULL,
    liquidation_price_nad BIGINT NOT NULL,
    entry_price_nad BIGINT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    tx_signature VARCHAR(88) NOT NULL,
    slot BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Convert tables to TimescaleDB Hypertables
-- ----------------------------------------------------------------------------

SELECT create_hypertable('swaps', 'timestamp', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
SELECT create_hypertable('adjust_liquidity', 'timestamp', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
SELECT create_hypertable('user_lp_position_updated_events', 'timestamp', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

-- Swaps indexes
CREATE INDEX swaps_timestamp_idx ON swaps USING btree ("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_pair ON swaps USING btree (pair);


-- Adjust liquidity indexes
CREATE INDEX adjust_liquidity_timestamp_idx ON adjust_liquidity USING btree ("timestamp" DESC);
CREATE INDEX idx_adjust_liquidity_pair ON adjust_liquidity USING btree (pair);
CREATE INDEX idx_adjust_liquidity_user_address ON adjust_liquidity USING btree (user_address);
CREATE INDEX idx_adjust_liquidity_timestamp ON adjust_liquidity USING btree ("timestamp");
CREATE INDEX idx_adjust_liquidity_event_type ON adjust_liquidity USING btree (event_type);

-- User liquidity positions indexes
CREATE INDEX idx_user_liquidity_positions_pair ON user_liquidity_positions USING btree (pair);
CREATE INDEX idx_user_liquidity_positions_token0_mint ON user_liquidity_positions USING btree (token0_mint);
CREATE INDEX idx_user_liquidity_positions_token1_mint ON user_liquidity_positions USING btree (token1_mint);
CREATE INDEX idx_user_liquidity_positions_updated_at ON user_liquidity_positions USING btree (updated_at DESC);

-- User LP position updated events indexes
CREATE INDEX user_lp_position_updated_events_timestamp_idx ON user_lp_position_updated_events USING btree ("timestamp" DESC);
CREATE INDEX idx_user_lp_position_updated_events_signer ON user_lp_position_updated_events USING btree (signer);
CREATE INDEX idx_user_lp_position_updated_events_pair_address ON user_lp_position_updated_events USING btree (pair_address);
CREATE INDEX idx_user_lp_position_updated_events_signer_pair ON user_lp_position_updated_events USING btree (signer, pair_address);
CREATE INDEX idx_user_lp_position_updated_events_timestamp ON user_lp_position_updated_events USING btree ("timestamp");

-- User borrow positions indexes
CREATE INDEX idx_user_borrow_positions_signer ON user_borrow_positions USING btree (signer);
CREATE INDEX idx_user_borrow_positions_pair ON user_borrow_positions USING btree (pair);
CREATE INDEX idx_user_borrow_positions_position ON user_borrow_positions USING btree ("position");
CREATE INDEX idx_user_borrow_positions_event_timestamp ON user_borrow_positions USING btree (event_timestamp);

-- User position updated events indexes
CREATE INDEX idx_user_position_updated_events_signer ON user_position_updated_events USING btree (signer);
CREATE INDEX idx_user_position_updated_events_pair ON user_position_updated_events USING btree (pair);
CREATE INDEX idx_user_position_updated_events_position ON user_position_updated_events USING btree ("position");
CREATE INDEX idx_user_position_updated_events_tx_sig ON user_position_updated_events USING btree (transaction_signature);
CREATE INDEX idx_user_position_updated_events_slot ON user_position_updated_events USING btree (slot);
CREATE INDEX idx_user_position_updated_events_event_timestamp ON user_position_updated_events USING btree (event_timestamp);

-- User position liquidated events indexes
CREATE INDEX idx_user_position_liquidated_events_signer ON user_position_liquidated_events USING btree (signer);
CREATE INDEX idx_user_position_liquidated_events_pair ON user_position_liquidated_events USING btree (pair);
CREATE INDEX idx_user_position_liquidated_events_position ON user_position_liquidated_events USING btree ("position");
CREATE INDEX idx_user_position_liquidated_events_liquidator ON user_position_liquidated_events USING btree (liquidator);
CREATE INDEX idx_user_position_liquidated_events_tx_sig ON user_position_liquidated_events USING btree (transaction_signature);
CREATE INDEX idx_user_position_liquidated_events_slot ON user_position_liquidated_events USING btree (slot);
CREATE INDEX idx_user_position_liquidated_events_event_timestamp ON user_position_liquidated_events USING btree (event_timestamp);

-- Adjust collateral events indexes
CREATE INDEX idx_adjust_collateral_events_signer ON adjust_collateral_events USING btree (signer);
CREATE INDEX idx_adjust_collateral_events_pair ON adjust_collateral_events USING btree (pair);
CREATE INDEX idx_adjust_collateral_events_tx_sig ON adjust_collateral_events USING btree (transaction_signature);
CREATE INDEX idx_adjust_collateral_events_slot ON adjust_collateral_events USING btree (slot);
CREATE INDEX idx_adjust_collateral_events_event_timestamp ON adjust_collateral_events USING btree (event_timestamp);

-- Adjust debt events indexes
CREATE INDEX idx_adjust_debt_events_signer ON adjust_debt_events USING btree (signer);
CREATE INDEX idx_adjust_debt_events_pair ON adjust_debt_events USING btree (pair);
CREATE INDEX idx_adjust_debt_events_tx_sig ON adjust_debt_events USING btree (transaction_signature);
CREATE INDEX idx_adjust_debt_events_slot ON adjust_debt_events USING btree (slot);
CREATE INDEX idx_adjust_debt_events_event_timestamp ON adjust_debt_events USING btree (event_timestamp);

-- Leverage position created events indexes
CREATE INDEX idx_leverage_position_created_user ON leverage_position_created_events USING btree (user_address);
CREATE INDEX idx_leverage_position_created_pair ON leverage_position_created_events USING btree (pair_address);
CREATE INDEX idx_leverage_position_created_position ON leverage_position_created_events USING btree (position_address);
CREATE INDEX idx_leverage_position_created_timestamp ON leverage_position_created_events USING btree ("timestamp");

-- Leverage position updated events indexes
CREATE INDEX idx_leverage_position_updated_user ON leverage_position_updated_events USING btree (user_address);
CREATE INDEX idx_leverage_position_updated_pair ON leverage_position_updated_events USING btree (pair_address);
CREATE INDEX idx_leverage_position_updated_position ON leverage_position_updated_events USING btree (position_address);
CREATE INDEX idx_leverage_position_updated_timestamp ON leverage_position_updated_events USING btree ("timestamp");
CREATE INDEX idx_leverage_position_updated_long_token0 ON leverage_position_updated_events USING btree (long_token0);

-- ----------------------------------------------------------------------------
-- Done
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    RAISE NOTICE 'Schema migration 001 completed successfully';
    RAISE NOTICE 'Tables created: pools, swaps, adjust_liquidity, user_liquidity_positions, user_lp_position_updated_events, user_borrow_positions, user_position_updated_events, user_position_liquidated_events, adjust_collateral_events, adjust_debt_events, leverage_position_created_events, leverage_position_updated_events';
    RAISE NOTICE 'TimescaleDB hypertables: swaps, adjust_liquidity, user_liquidity_positions, user_lp_position_updated_events';
END $$;
