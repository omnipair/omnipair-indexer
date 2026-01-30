-- ============================================================================
-- Migration: Add visible column to pools and create whitelisted_tokens table
-- ============================================================================
-- Description: This migration adds a 'visible' column to the pools table
--              for controlling frontend visibility, and creates a new
--              whitelisted_tokens table for managing token whitelisting.
--
-- Prerequisites:
--   - Migrations 001, 002, and 003 must be applied
--
-- Usage:
--   psql -U omnipair_user -d omnipair_indexer -f 004_add_visibility_and_whitelisted_tokens.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Add visible column to pools table
-- ----------------------------------------------------------------------------

ALTER TABLE pools
ADD COLUMN visible BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- Create whitelisted_tokens table
-- ----------------------------------------------------------------------------

CREATE TABLE whitelisted_tokens (
    id SERIAL PRIMARY KEY,
    token_mint VARCHAR(44) NOT NULL UNIQUE,
    whitelisted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

CREATE INDEX idx_pools_visible ON pools USING btree (visible);
CREATE INDEX idx_whitelisted_tokens_mint ON whitelisted_tokens USING btree (token_mint);
CREATE INDEX idx_whitelisted_tokens_whitelisted ON whitelisted_tokens USING btree (whitelisted);

-- ----------------------------------------------------------------------------
-- Done
-- ----------------------------------------------------------------------------

DO $$
BEGIN
    RAISE NOTICE 'Schema migration 004 completed successfully';
    RAISE NOTICE 'Added visible column to: pools';
    RAISE NOTICE 'Created table: whitelisted_tokens (id, token_mint, whitelisted, created_at, updated_at)';
END $$;
