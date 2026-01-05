-- Migration: Add PostgreSQL LISTEN/NOTIFY trigger for user_position_updated_events
-- Description: This trigger sends a notification when a new UserPositionUpdatedEvent is inserted or updated
-- Channel: user_position_updates

-- Function that sends the notification with event data as JSON
CREATE OR REPLACE FUNCTION notify_user_position_updated()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'user_position_updates',
        json_build_object(
            'pair', NEW.pair,
            'signer', NEW.signer,
            'position', NEW.position,
            'collateral0', NEW.collateral0::text,
            'collateral1', NEW.collateral1::text,
            'debt0_shares', NEW.debt0_shares::text,
            'debt1_shares', NEW.debt1_shares::text,
            'collateral0_applied_min_cf_bps', NEW.collateral0_applied_min_cf_bps,
            'collateral1_applied_min_cf_bps', NEW.collateral1_applied_min_cf_bps,
            'transaction_signature', NEW.transaction_signature,
            'slot', NEW.slot::text,
            'event_timestamp', EXTRACT(EPOCH FROM NEW.event_timestamp)::bigint::text
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger that executes the function after INSERT or UPDATE
DROP TRIGGER IF EXISTS user_position_updated_notify ON user_position_updated_events;

CREATE TRIGGER user_position_updated_notify
AFTER INSERT OR UPDATE ON user_position_updated_events
FOR EACH ROW
EXECUTE FUNCTION notify_user_position_updated();

-- Log the successful creation
DO $$
BEGIN
    RAISE NOTICE 'Migration 001: Successfully created trigger for user_position_updated_events';
END $$;
