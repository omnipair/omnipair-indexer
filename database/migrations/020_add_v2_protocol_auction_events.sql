CREATE TABLE IF NOT EXISTS v2_protocol_auction_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    market TEXT,
    authority TEXT,
    lane INTEGER,
    tx_sig TEXT NOT NULL,
    slot BIGINT NOT NULL,
    instruction_index INTEGER NOT NULL,
    instruction_path TEXT NOT NULL,
    payload JSONB NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tx_sig, instruction_path, event_type)
);

CREATE INDEX IF NOT EXISTS v2_protocol_auction_events_market_timestamp_idx
    ON v2_protocol_auction_events (market, timestamp DESC)
    WHERE market IS NOT NULL;

CREATE INDEX IF NOT EXISTS v2_protocol_auction_events_authority_timestamp_idx
    ON v2_protocol_auction_events (authority, timestamp DESC)
    WHERE authority IS NOT NULL;

CREATE INDEX IF NOT EXISTS v2_protocol_auction_events_type_timestamp_idx
    ON v2_protocol_auction_events (event_type, timestamp DESC);
