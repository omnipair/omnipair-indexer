-- Migration: Add PostgreSQL LISTEN/NOTIFY trigger for swaps
-- Description: This trigger sends a notification when a new swap is inserted or updated
-- Channel: swap_updates

-- Function that sends the notification with swap data as JSON
CREATE OR REPLACE FUNCTION notify_swap_updated()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'swap_updates',
        json_build_object(
            'id', NEW.id::text,
            'pair', NEW.pair,
            'user_address', NEW.user_address,
            'is_token0_in', NEW.is_token0_in,
            'amount_in', NEW.amount_in::text,
            'amount_out', NEW.amount_out::text,
            'reserve0', NEW.reserve0::text,
            'reserve1', NEW.reserve1::text,
            'timestamp', to_char(NEW.timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'tx_sig', NEW.tx_sig,
            'slot', NEW.slot::text,
            'fee_paid0', NEW.fee_paid0::text,
            'fee_paid1', NEW.fee_paid1::text,
            'ema_price', COALESCE(NEW.ema_price::text, '')
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger that executes the function after INSERT or UPDATE
DROP TRIGGER IF EXISTS swap_notify ON swaps;

CREATE TRIGGER swap_notify
AFTER INSERT OR UPDATE ON swaps
FOR EACH ROW
EXECUTE FUNCTION notify_swap_updated();

-- Log the successful creation
DO $$
BEGIN
    RAISE NOTICE 'Migration 001: Successfully created trigger for swaps';
END $$;
