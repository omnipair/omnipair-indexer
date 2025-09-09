-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create hypertables for time-series data
SELECT create_hypertable('transaction_details', 'time', if_not_exists => TRUE);
SELECT create_hypertable('price_feeds', 'time', if_not_exists => TRUE);
SELECT create_hypertable('market_state', 'time', if_not_exists => TRUE);

-- Create continuous aggregates for price feeds (1-minute intervals)
CREATE MATERIALIZED VIEW IF NOT EXISTS price_feeds_1m
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 minute', time) AS bucket,
    pair_address,
    AVG(price0) AS avg_price0,
    AVG(price1) AS avg_price1,
    MAX(price0) AS max_price0,
    MAX(price1) AS max_price1,
    MIN(price0) AS min_price0,
    MIN(price1) AS min_price1,
    SUM(volume_24h) AS total_volume,
    COUNT(*) AS tx_count
FROM price_feeds
GROUP BY bucket, pair_address;

-- Create continuous aggregates for transaction details (1-hour intervals)
CREATE MATERIALIZED VIEW IF NOT EXISTS transaction_details_1h
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS bucket,
    pair_address,
    transaction_type,
    COUNT(*) AS tx_count,
    SUM(volume_usd) AS total_volume_usd,
    SUM(fees_usd) AS total_fees_usd,
    AVG(price0) AS avg_price0,
    AVG(price1) AS avg_price1
FROM transaction_details
GROUP BY bucket, pair_address, transaction_type;

-- Create continuous aggregates for market state (1-hour intervals)
CREATE MATERIALIZED VIEW IF NOT EXISTS market_state_1h
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS bucket,
    pair_address,
    AVG(reserve0) AS avg_reserve0,
    AVG(reserve1) AS avg_reserve1,
    AVG(total_supply) AS avg_total_supply,
    AVG(tvl_usd) AS avg_tvl_usd,
    AVG(volume_24h_usd) AS avg_volume_24h_usd,
    MAX(tvl_usd) AS max_tvl_usd,
    MIN(tvl_usd) AS min_tvl_usd
FROM market_state
GROUP BY bucket, pair_address;

-- Add refresh policies for continuous aggregates
SELECT add_continuous_aggregate_policy('price_feeds_1m',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute');

SELECT add_continuous_aggregate_policy('transaction_details_1h',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

SELECT add_continuous_aggregate_policy('market_state_1h',
    start_offset => INTERVAL '2 hours',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transaction_details_pair_time_type 
ON transaction_details (pair_address, time DESC, transaction_type);

CREATE INDEX IF NOT EXISTS idx_transaction_details_user_time 
ON transaction_details (user_address, time DESC);

CREATE INDEX IF NOT EXISTS idx_price_feeds_pair_time 
ON price_feeds (pair_address, time DESC);

CREATE INDEX IF NOT EXISTS idx_market_state_pair_time 
ON market_state (pair_address, time DESC);

-- Create retention policies (keep raw data for 30 days, aggregated data for 1 year)
SELECT add_retention_policy('transaction_details', INTERVAL '30 days');
SELECT add_retention_policy('price_feeds', INTERVAL '30 days');
SELECT add_retention_policy('market_state', INTERVAL '30 days');

-- Keep continuous aggregates for longer
SELECT add_retention_policy('price_feeds_1m', INTERVAL '1 year');
SELECT add_retention_policy('transaction_details_1h', INTERVAL '1 year');
SELECT add_retention_policy('market_state_1h', INTERVAL '1 year');

