-- ============================================================================
-- Migration: Add utilization rate params columns to pools table
-- ============================================================================
-- Description: This migration adds utilization rate configuration columns to
--              the pools table for target utilization and rate parameters.
--
-- Prerequisites:
--   - Migrations 001, 002, 003, and 004 must be applied
--
-- Usage:
--   psql -U omnipair_user -d omnipair_indexer -f 005_add_util_rate_params.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Add utilization rate params columns to pools table
-- ----------------------------------------------------------------------------

ALTER TABLE pools
ADD COLUMN target_util_start_bps BIGINT DEFAULT NULL,
ADD COLUMN target_util_end_bps BIGINT DEFAULT NULL,
ADD COLUMN rate_half_life_ms BIGINT DEFAULT NULL,
ADD COLUMN min_rate_bps BIGINT DEFAULT NULL,
ADD COLUMN max_rate_bps BIGINT DEFAULT NULL;

-- ----------------------------------------------------------------------------
-- Done
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    RAISE NOTICE 'Schema migration 005 completed successfully';
    RAISE NOTICE 'Added columns to pools: target_util_start_bps, target_util_end_bps, rate_half_life_ms, min_rate_bps, max_rate_bps';
END $$;
