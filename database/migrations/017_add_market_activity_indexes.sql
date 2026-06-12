-- Migration: Add pair/time indexes for market-scoped activity history

CREATE INDEX IF NOT EXISTS idx_adjust_liquidity_pair_timestamp_desc
  ON adjust_liquidity USING btree (pair, "timestamp" DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_adjust_collateral_pair_event_ts_desc
  ON adjust_collateral_events USING btree (pair, event_timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_adjust_debt_pair_event_ts_desc
  ON adjust_debt_events USING btree (pair, event_timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_user_position_liquidated_pair_event_ts_desc
  ON user_position_liquidated_events USING btree (pair, event_timestamp DESC, id DESC);
