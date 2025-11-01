CREATE INDEX IF NOT EXISTS idx_swaps_timestamp ON swaps(timestamp) WHERE timestamp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swaps_pair ON swaps(pair) WHERE pair IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swaps_user_address ON swaps(user_address) WHERE user_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_swaps_timestamp_token0 ON swaps(timestamp, is_token0_in) WHERE timestamp IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_swaps_volume_query ON swaps(timestamp, is_token0_in, amount_in, amount_out) WHERE timestamp IS NOT NULL;