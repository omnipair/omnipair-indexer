#!/bin/bash
# ============================================================================
# Apply All Migrations
# ============================================================================
# Applies all migrations in order to an existing database.
# Use this for Railway/prod/staging environments where the DB already exists.
#
# Usage:
#   DATABASE_URL="postgresql://..." ./scripts/apply_all_migrations.sh
#
# Or with .env file:
#   cd database
#   ./scripts/apply_all_migrations.sh
# ============================================================================

set -e

# Load .env if it exists
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "Error: DATABASE_URL environment variable is not set"
    echo ""
    echo "Usage:"
    echo "  DATABASE_URL=\"postgresql://...\" ./scripts/apply_all_migrations.sh"
    echo ""
    echo "Or create a .env file with DATABASE_URL=..."
    exit 1
fi

echo "============================================"
echo "Applying All Migrations"
echo "============================================"
echo ""

# Count migrations
MIGRATION_COUNT=$(ls -1 migrations/*.sql 2>/dev/null | wc -l)
if [ "$MIGRATION_COUNT" -eq 0 ]; then
    echo "No migrations found in migrations/"
    exit 0
fi

echo "Found $MIGRATION_COUNT migration(s)"
echo ""

# Apply migrations in order
APPLIED=0
FAILED=0

for migration in migrations/*.sql; do
    MIGRATION_NAME=$(basename "$migration")
    echo -n "  -> $MIGRATION_NAME ... "
    
    if psql "$DATABASE_URL" -f "$migration" -q 2>/dev/null; then
        echo "OK"
        ((APPLIED++))
    else
        echo "FAILED"
        ((FAILED++))
    fi
done

echo ""
echo "============================================"
echo "Migration Summary"
echo "============================================"
echo "  Applied: $APPLIED"
echo "  Failed:  $FAILED"
echo ""

if [ "$FAILED" -gt 0 ]; then
    echo "Some migrations failed. Check the errors above."
    exit 1
fi

echo "All migrations applied successfully!"
