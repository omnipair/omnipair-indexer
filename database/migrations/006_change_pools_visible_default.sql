-- ============================================================================
-- Migration: Change default value of visible column in pools table to TRUE
-- ============================================================================
-- Description: This migration changes the default value of the 'visible'
--              column in the pools table from FALSE to TRUE, so that newly
--              created pools are visible by default.
--
-- Prerequisites:
--   - Migrations 001 through 005 must be applied
--
-- Usage:
--   psql -U omnipair_user -d omnipair_indexer -f 006_change_pools_visible_default.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Change default value of visible column from FALSE to TRUE
-- ----------------------------------------------------------------------------

ALTER TABLE pools
ALTER COLUMN visible SET DEFAULT TRUE;

-- ----------------------------------------------------------------------------
-- Done
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    RAISE NOTICE 'Schema migration 006 completed successfully';
    RAISE NOTICE 'Changed default value of pools.visible from FALSE to TRUE';
END $$;
