-- ============================================================================
-- Migration: Add slot column to liquidity-related tables
-- ============================================================================
-- Description: This migration adds a 'slot' column to adjust_liquidity,
--              user_liquidity_positions, and user_lp_position_updated_events
--              tables to track the Solana slot number for each event.
--
-- Prerequisites:
--   - Migration 001 and 002 must be applied
--
-- Usage:
--   psql -U omnipair_user -d omnipair_indexer -f 003_add_slot_column.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Add slot column to adjust_liquidity table
-- ----------------------------------------------------------------------------

ALTER TABLE adjust_liquidity
ADD COLUMN slot NUMERIC;

-- ----------------------------------------------------------------------------
-- Add slot column to user_liquidity_positions table
-- ----------------------------------------------------------------------------

ALTER TABLE user_liquidity_positions
ADD COLUMN slot NUMERIC;

-- ----------------------------------------------------------------------------
-- Add slot column to user_lp_position_updated_events table
-- ----------------------------------------------------------------------------

ALTER TABLE user_lp_position_updated_events
ADD COLUMN slot NUMERIC;

-- ----------------------------------------------------------------------------
-- Done
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    RAISE NOTICE 'Schema migration 003 completed successfully';
    RAISE NOTICE 'Added slot column to: adjust_liquidity, user_liquidity_positions, user_lp_position_updated_events';
END $$;
