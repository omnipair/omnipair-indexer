-- V2 market accounting snapshot projected from decoded market events.

CREATE TABLE IF NOT EXISTS v2_market_snapshots (
    market TEXT PRIMARY KEY REFERENCES v2_markets(market_address) ON DELETE CASCADE,
    base_reserve NUMERIC NOT NULL DEFAULT 0,
    quote_reserve NUMERIC NOT NULL DEFAULT 0,
    base_ylp_supply NUMERIC NOT NULL DEFAULT 0,
    quote_ylp_supply NUMERIC NOT NULL DEFAULT 0,
    fixed_base_debt NUMERIC NOT NULL DEFAULT 0,
    fixed_quote_debt NUMERIC NOT NULL DEFAULT 0,
    recognized_base_collateral_for_quote_debt NUMERIC NOT NULL DEFAULT 0,
    recognized_quote_collateral_for_base_debt NUMERIC NOT NULL DEFAULT 0,
    effective_base_debt_nad NUMERIC NOT NULL DEFAULT 0,
    effective_quote_debt_nad NUMERIC NOT NULL DEFAULT 0,
    base_debt_health_bps NUMERIC NOT NULL DEFAULT 0,
    quote_debt_health_bps NUMERIC NOT NULL DEFAULT 0,
    source_tx_sig TEXT,
    source_slot BIGINT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS v2_market_snapshot_applied_events (
    event_type TEXT NOT NULL,
    tx_sig TEXT NOT NULL,
    instruction_path TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_type, tx_sig, instruction_path)
);

INSERT INTO v2_market_snapshots (market)
SELECT market_address
FROM v2_markets
ON CONFLICT (market) DO NOTHING;

WITH liquidity_delta AS (
    SELECT
        e.market,
        SUM(
            CASE
                WHEN e.event_type = 'liquidity_added'
                    THEN (e.payload->>'base_reserve_credit')::NUMERIC
                WHEN e.event_type = 'liquidity_removed'
                    THEN -((e.payload->>'base_amount_out')::NUMERIC)
                ELSE 0
            END
        ) AS base_delta,
        SUM(
            CASE
                WHEN e.event_type = 'liquidity_added'
                    THEN (e.payload->>'quote_reserve_credit')::NUMERIC
                WHEN e.event_type = 'liquidity_removed'
                    THEN -((e.payload->>'quote_amount_out')::NUMERIC)
                ELSE 0
            END
        ) AS quote_delta
    FROM v2_market_events e
    WHERE e.event_type IN ('liquidity_added', 'liquidity_removed')
    GROUP BY e.market
),
swap_delta AS (
    SELECT
        s.market,
        SUM(
            CASE
                WHEN s.asset_in_mint = m.base_mint THEN s.reserve_credit
                WHEN s.asset_out_mint = m.base_mint THEN -(s.amount_out)
                ELSE 0
            END
        ) AS base_delta,
        SUM(
            CASE
                WHEN s.asset_in_mint = m.quote_mint THEN s.reserve_credit
                WHEN s.asset_out_mint = m.quote_mint THEN -(s.amount_out)
                ELSE 0
            END
        ) AS quote_delta
    FROM v2_swaps s
    JOIN v2_markets m ON m.market_address = s.market
    GROUP BY s.market
),
reserve_delta AS (
    SELECT
        COALESCE(liquidity_delta.market, swap_delta.market) AS market,
        COALESCE(liquidity_delta.base_delta, 0) + COALESCE(swap_delta.base_delta, 0) AS base_delta,
        COALESCE(liquidity_delta.quote_delta, 0) + COALESCE(swap_delta.quote_delta, 0) AS quote_delta
    FROM liquidity_delta
    FULL OUTER JOIN swap_delta ON swap_delta.market = liquidity_delta.market
)
UPDATE v2_market_snapshots snapshot
SET
    base_reserve = GREATEST(reserve_delta.base_delta, 0),
    quote_reserve = GREATEST(reserve_delta.quote_delta, 0),
    updated_at = now()
FROM reserve_delta
WHERE snapshot.market = reserve_delta.market;

WITH latest_liquidity_state AS (
    SELECT DISTINCT ON (market)
        e.market,
        (e.payload->>'base_ylp_supply')::NUMERIC AS base_ylp_supply,
        (e.payload->>'quote_ylp_supply')::NUMERIC AS quote_ylp_supply
    FROM v2_market_events e
    WHERE e.event_type IN ('liquidity_added', 'liquidity_removed')
    ORDER BY e.market, e.slot DESC, e.instruction_path DESC, e.id DESC
)
UPDATE v2_market_snapshots snapshot
SET
    base_ylp_supply = COALESCE(latest_liquidity_state.base_ylp_supply, snapshot.base_ylp_supply),
    quote_ylp_supply = COALESCE(latest_liquidity_state.quote_ylp_supply, snapshot.quote_ylp_supply),
    updated_at = now()
FROM latest_liquidity_state
WHERE snapshot.market = latest_liquidity_state.market;

WITH latest_debt AS (
    SELECT DISTINCT ON (market)
        market,
        (payload->>'fixed_base_debt')::NUMERIC AS fixed_base_debt,
        (payload->>'fixed_quote_debt')::NUMERIC AS fixed_quote_debt,
        (payload->>'base_debt_health_bps')::NUMERIC AS base_debt_health_bps,
        (payload->>'quote_debt_health_bps')::NUMERIC AS quote_debt_health_bps,
        tx_sig,
        slot
    FROM v2_market_events
    WHERE event_type = 'debt_updated'
    ORDER BY market, slot DESC, instruction_path DESC, id DESC
)
UPDATE v2_market_snapshots snapshot
SET
    fixed_base_debt = latest_debt.fixed_base_debt,
    fixed_quote_debt = latest_debt.fixed_quote_debt,
    base_debt_health_bps = latest_debt.base_debt_health_bps,
    quote_debt_health_bps = latest_debt.quote_debt_health_bps,
    source_tx_sig = latest_debt.tx_sig,
    source_slot = latest_debt.slot,
    updated_at = now()
FROM latest_debt
WHERE snapshot.market = latest_debt.market;

WITH latest_health AS (
    SELECT DISTINCT ON (market)
        market,
        (payload->>'recognized_base_collateral_for_quote_debt')::NUMERIC AS recognized_base_collateral_for_quote_debt,
        (payload->>'recognized_quote_collateral_for_base_debt')::NUMERIC AS recognized_quote_collateral_for_base_debt,
        (payload->>'effective_base_debt_nad')::NUMERIC AS effective_base_debt_nad,
        (payload->>'effective_quote_debt_nad')::NUMERIC AS effective_quote_debt_nad,
        (payload->>'base_debt_health_bps')::NUMERIC AS base_debt_health_bps,
        (payload->>'quote_debt_health_bps')::NUMERIC AS quote_debt_health_bps,
        tx_sig,
        slot
    FROM v2_market_events
    WHERE event_type = 'market_health_updated'
    ORDER BY market, slot DESC, instruction_path DESC, id DESC
)
UPDATE v2_market_snapshots snapshot
SET
    recognized_base_collateral_for_quote_debt = latest_health.recognized_base_collateral_for_quote_debt,
    recognized_quote_collateral_for_base_debt = latest_health.recognized_quote_collateral_for_base_debt,
    effective_base_debt_nad = latest_health.effective_base_debt_nad,
    effective_quote_debt_nad = latest_health.effective_quote_debt_nad,
    base_debt_health_bps = latest_health.base_debt_health_bps,
    quote_debt_health_bps = latest_health.quote_debt_health_bps,
    source_tx_sig = latest_health.tx_sig,
    source_slot = latest_health.slot,
    updated_at = now()
FROM latest_health
WHERE snapshot.market = latest_health.market;

INSERT INTO v2_market_snapshot_applied_events (event_type, tx_sig, instruction_path)
SELECT event_type, tx_sig, instruction_path
FROM v2_market_events
WHERE event_type IN (
    'liquidity_added',
    'liquidity_removed',
    'swap_executed',
    'debt_updated',
    'market_health_updated'
)
ON CONFLICT DO NOTHING;
