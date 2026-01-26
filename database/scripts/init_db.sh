#!/bin/bash
# ============================================================================
# Initialize Omnipair Database
# ============================================================================
# Creates a fresh database with all tables, indexes, and triggers.
# Run this script from the database/ directory.
#
# Prerequisites:
#   - PostgreSQL 14+ running locally
#   - TimescaleDB extension installed
#   - User 'omnipair_user' exists (or modify DB_USER below)
#
# Usage:
#   cd database
#   ./scripts/init_db.sh
# ============================================================================

set -e

DB_USER="${DB_USER:-omnipair_user}"
DB_NAME="${DB_NAME:-omnipair_indexer}"

echo "============================================"
echo "Omnipair Database Initialization"
echo "============================================"
echo "User: $DB_USER"
echo "Database: $DB_NAME"
echo ""

# Check if database exists
if psql -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
    echo "Database '$DB_NAME' already exists."
    read -p "Drop and recreate? (y/N): " confirm
    if [[ "$confirm" =~ ^[Yy]$ ]]; then
        echo "Dropping database..."
        dropdb -U "$DB_USER" "$DB_NAME"
        echo "Creating database..."
        createdb -U "$DB_USER" "$DB_NAME"
    else
        echo "Aborted."
        exit 1
    fi
else
    echo "Creating database '$DB_NAME'..."
    createdb -U "$DB_USER" "$DB_NAME"
fi

echo ""
echo "Applying migrations..."
echo ""

# Apply migrations in order
for migration in migrations/*.sql; do
    echo "  -> $(basename "$migration")"
    psql -U "$DB_USER" -d "$DB_NAME" -f "$migration" -q
done

echo ""
echo "============================================"
echo "Database initialized successfully!"
echo "============================================"
echo ""
echo "Connection string:"
echo "  postgresql://$DB_USER:PASSWORD@localhost:5432/$DB_NAME"
echo ""
