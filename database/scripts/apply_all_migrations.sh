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

MIGRATIONS=()
while IFS= read -r migration; do
    MIGRATIONS+=("$migration")
done < <(find migrations -maxdepth 1 -type f -name '*.sql' ! -name 'truncate_all_data.sql' | sort)

MIGRATION_COUNT=${#MIGRATIONS[@]}
if [ "$MIGRATION_COUNT" -eq 0 ]; then
    echo "No migrations found in migrations/"
    exit 0
fi

echo "Found $MIGRATION_COUNT migration(s)"
echo ""

# Apply migrations in order
APPLIED=0
FAILED=0

for migration in "${MIGRATIONS[@]}"; do
    MIGRATION_NAME=$(basename "$migration")
    echo -n "  -> $MIGRATION_NAME ... "
    
    if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$migration" -q; then
        echo "OK"
        APPLIED=$((APPLIED + 1))
    else
        echo "FAILED"
        FAILED=$((FAILED + 1))
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
