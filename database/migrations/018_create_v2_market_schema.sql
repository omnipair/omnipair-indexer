-- V2 market-native schema.

CREATE TABLE IF NOT EXISTS v2_markets (
    market_address TEXT PRIMARY KEY,
    base_mint TEXT NOT NULL,
    quote_mint TEXT NOT NULL,
    base_claim_token_mint TEXT NOT NULL,
    quote_claim_token_mint TEXT NOT NULL,
    base_hedge_token_mint TEXT NOT NULL,
    quote_hedge_token_mint TEXT NOT NULL,
    base_stake_vault TEXT NOT NULL,
    quote_stake_vault TEXT NOT NULL,
    base_collateral_vault TEXT NOT NULL,
    quote_collateral_vault TEXT NOT NULL,
    base_insurance_vault TEXT NOT NULL,
    quote_insurance_vault TEXT NOT NULL,
    base_hedge_vault TEXT NOT NULL,
    quote_hedge_vault TEXT NOT NULL,
    operator TEXT NOT NULL,
    manager TEXT NOT NULL,
    buffer_ratio_bps INTEGER NOT NULL,
    swap_fee_bps INTEGER NOT NULL,
    operator_fee_bps INTEGER,
    protocol_fee_bps INTEGER NOT NULL,
    params_hash BYTEA NOT NULL,
    version INTEGER NOT NULL,
    reduce_only BOOLEAN NOT NULL DEFAULT FALSE,
    created_tx_sig TEXT,
    created_slot BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_swaps (
    id BIGSERIAL PRIMARY KEY,
    market TEXT NOT NULL REFERENCES v2_markets(market_address) ON DELETE CASCADE,
    trader TEXT NOT NULL,
    asset_in_mint TEXT NOT NULL,
    asset_out_mint TEXT NOT NULL,
    reserve_credit NUMERIC NOT NULL,
    amount_in_after_fee NUMERIC NOT NULL,
    amount_out NUMERIC NOT NULL,
    fee_credit NUMERIC NOT NULL,
    tx_sig TEXT NOT NULL,
    slot BIGINT NOT NULL,
    instruction_index INTEGER NOT NULL,
    instruction_path TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tx_sig, instruction_path)
);

CREATE TABLE IF NOT EXISTS v2_market_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    market TEXT NOT NULL,
    owner TEXT,
    asset_mint TEXT,
    tx_sig TEXT NOT NULL,
    slot BIGINT NOT NULL,
    instruction_index INTEGER NOT NULL,
    instruction_path TEXT NOT NULL,
    payload JSONB NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tx_sig, instruction_path, event_type)
);

CREATE INDEX IF NOT EXISTS v2_markets_base_quote_idx
    ON v2_markets (base_mint, quote_mint);

CREATE INDEX IF NOT EXISTS v2_swaps_market_timestamp_idx
    ON v2_swaps (market, timestamp DESC);

CREATE INDEX IF NOT EXISTS v2_swaps_trader_timestamp_idx
    ON v2_swaps (trader, timestamp DESC);

CREATE INDEX IF NOT EXISTS v2_market_events_market_timestamp_idx
    ON v2_market_events (market, timestamp DESC);

CREATE INDEX IF NOT EXISTS v2_market_events_owner_timestamp_idx
    ON v2_market_events (owner, timestamp DESC)
    WHERE owner IS NOT NULL;

CREATE INDEX IF NOT EXISTS v2_market_events_type_timestamp_idx
    ON v2_market_events (event_type, timestamp DESC);
