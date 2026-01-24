# Omnipair Database

Database schema and migrations for the Omnipair indexer.

## Prerequisites

- PostgreSQL 14+
- TimescaleDB extension
- User: `omnipair_user`
- Database: `omnipair_indexer`

## Quick Start (Fresh Database)

```bash
cd database
./scripts/init_db.sh
```

This will:
1. Create the database (or drop/recreate if it exists)
2. Apply all migrations in order
3. Set up TimescaleDB hypertables for time-series data

## Migrations

Migrations are in `./migrations/` and applied in alphabetical order:

| File | Description |
|------|-------------|
| `001_create_schema.sql` | Creates all tables, enums, indexes, and TimescaleDB hypertables |
| `002_add_swaps_notify_trigger.sql` | Adds PostgreSQL LISTEN/NOTIFY trigger for real-time swap updates |

### Apply a single migration

```bash
./scripts/apply_migration.sh migrations/001_create_schema.sql
```

### Apply all migrations (Railway/Prod)

```bash
DATABASE_URL="postgresql://..." ./scripts/apply_all_migrations.sh
```

Or with `.env` file containing `DATABASE_URL`:
```bash
cd database
./scripts/apply_all_migrations.sh
```

## Scripts

| Script | Description |
|--------|-------------|
| `init_db.sh` | Initialize fresh local database (creates DB + applies migrations) |
| `apply_migration.sh` | Apply a single migration file |
| `apply_all_migrations.sh` | Apply all migrations to existing DB (for Railway/prod) |
| `clone_from_prod.sh` | Clone schema + data from production (requires `PUBLIC_DB_URL` in `.env`) |
| `imitate_swaps_stream.sh` | Test utility - generates fake swaps to test NOTIFY trigger |

## Environment Variables

Create a `.env` file in this directory:

```bash
# For applying migrations to Railway/prod
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# For cloning schema from production
PUBLIC_DB_URL=postgresql://user:pass@host:5432/dbname
```

## Tables Overview

### Core Tables
- `pools` - Pair metadata (token addresses, fees, etc.)
- `swaps` - Swap events (TimescaleDB hypertable)
- `adjust_liquidity` - Mint/burn events (TimescaleDB hypertable)

### User Position Tables
- `user_liquidity_positions` - Current LP positions (TimescaleDB hypertable)
- `user_lp_position_updated_events` - LP position history (TimescaleDB hypertable)
- `user_borrow_positions` - Current borrow positions
- `user_position_updated_events` - Borrow position history
- `user_position_liquidated_events` - Liquidation events

### Collateral/Debt Tables
- `adjust_collateral_events` - Collateral adjustment history
- `adjust_debt_events` - Debt adjustment history

### Leverage Tables
- `leverage_position_created_events` - Leverage position creation
- `leverage_position_updated_events` - Leverage position updates
