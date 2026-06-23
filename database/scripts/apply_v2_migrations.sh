#!/bin/bash
# Apply only the V2 market schema migrations.
#
# Set OMNIPAIR_V2_RESET_SCHEMA=1 to drop stale devnet v2_* tables before
# applying the final yLP/hLP schema. This never touches legacy V1 tables.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$DATABASE_DIR/.env" ]; then
    export $(grep -v '^#' "$DATABASE_DIR/.env" | xargs)
fi

DATABASE_URL="${DATABASE_URL:-${DATABASE_PUBLIC_URL:-}}"
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL or DATABASE_PUBLIC_URL environment variable is not set"
    exit 1
fi

echo "============================================"
echo "Applying V2 Market Migrations"
echo "============================================"

if [ "${OMNIPAIR_V2_RESET_SCHEMA:-0}" = "1" ]; then
    echo "Resetting V2-only tables ..."
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
DROP TABLE IF EXISTS
    v2_market_snapshot_applied_events,
    v2_market_snapshots,
    v2_market_events,
    v2_swaps,
    v2_markets
CASCADE;
SQL
fi

for migration in \
    "$DATABASE_DIR/migrations/018_create_v2_market_schema.sql" \
    "$DATABASE_DIR/migrations/019_add_v2_market_snapshots.sql"
do
    echo -n "  -> $(basename "$migration") ... "
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" -q
    echo "OK"
done

echo "V2 market migrations applied successfully."
