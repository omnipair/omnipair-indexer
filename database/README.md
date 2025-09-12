# Database Layer

The shared database layer for the Omnipair indexer, built with Drizzle ORM and optimized for PostgreSQL with TimescaleDB for time-series data.

## 🏗️ Architecture

The database layer provides:

- **Schema Management**: Type-safe schema definitions with Drizzle ORM
- **Migration System**: Version-controlled database migrations
- **TimescaleDB Integration**: Time-series optimization for transaction data
- **Type Safety**: Full TypeScript types for database operations
- **Connection Management**: Efficient connection pooling and management

### Technology Stack

- **PostgreSQL 14+**: Primary database engine
- **TimescaleDB**: Time-series extension for PostgreSQL
- **Drizzle ORM**: Type-safe ORM with excellent performance
- **Drizzle Kit**: Migration and schema management tools

## 📁 Project Structure

```
database/
├── package.json              # Node.js dependencies
├── drizzle.config.ts         # Drizzle configuration
├── tsconfig.json            # TypeScript configuration
├── lib/                     # Library exports
│   ├── index.ts             # Main exports
│   ├── schema.ts            # Database schema definitions
│   └── drizzle.config.ts    # Drizzle config (symlink)
├── src/                     # Source code
│   ├── index.ts             # Migration runner
│   └── run-sql.ts           # SQL execution utility
├── migrations/              # Generated migration files
│   ├── 0001_initial.sql     # Initial schema
│   ├── 0002_add_indexes.sql # Performance indexes
│   └── meta/                # Migration metadata
└── sql/                     # Custom SQL scripts
    ├── setup-timescaledb.sql # TimescaleDB setup
    ├── indexes.sql          # Additional indexes
    └── views.sql            # Database views
```

## 🚀 Getting Started

### Prerequisites

- **PostgreSQL 14+**: With TimescaleDB extension
- **Bun or Node.js**: For running migrations
- **Database Permissions**: CREATE, ALTER, DROP permissions

### Environment Variables

Create a `.env` file in the database directory:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/omnipair_indexer

# Optional: Connection pool settings
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=10000
```

### Setup Database

```bash
# From the database directory
cd database

# Install dependencies
bun install

# Create database (if not exists)
createdb omnipair_indexer

# Enable TimescaleDB extension
psql omnipair_indexer -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Run migrations
bun run migrate

# Setup TimescaleDB hypertables and policies
psql omnipair_indexer -f sql/setup-timescaledb.sql
```

## 📊 Database Schema

### Core Tables

#### Pairs
Stores Omnipair trading pair information.

```sql
CREATE TABLE pairs (
    pair_address VARCHAR(44) PRIMARY KEY,
    token0_address VARCHAR(44) NOT NULL,
    token1_address VARCHAR(44) NOT NULL,
    token0_decimals SMALLINT NOT NULL,
    token1_decimals SMALLINT NOT NULL,
    swap_fee_bps INTEGER NOT NULL,
    half_life BIGINT NOT NULL,
    pool_deployer_fee_bps INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### User Positions
Current user positions with collateral/debt tracking.

```sql
CREATE TABLE user_positions (
    position_address VARCHAR(44) PRIMARY KEY,
    user_address VARCHAR(44) NOT NULL,
    pair_address VARCHAR(44) NOT NULL REFERENCES pairs(pair_address),
    collateral0_amount BIGINT NOT NULL DEFAULT 0,
    collateral1_amount BIGINT NOT NULL DEFAULT 0,
    debt0_shares BIGINT NOT NULL DEFAULT 0,
    debt1_shares BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Transaction Details (TimescaleDB Hypertable)
Detailed transaction data optimized for time-series queries.

```sql
CREATE TABLE transaction_details (
    time TIMESTAMPTZ NOT NULL,
    tx_signature VARCHAR(88) NOT NULL,
    slot BIGINT NOT NULL,
    pair_address VARCHAR(44) NOT NULL,
    user_address VARCHAR(44) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'success',
    
    -- Amounts
    amount0_in BIGINT DEFAULT 0,
    amount1_in BIGINT DEFAULT 0,
    amount0_out BIGINT DEFAULT 0,
    amount1_out BIGINT DEFAULT 0,
    
    -- Calculated fields
    price0 DECIMAL(20,10),
    price1 DECIMAL(20,10),
    volume_usd DECIMAL(20,6),
    fees_usd DECIMAL(20,6),
    
    -- Metadata
    metadata JSONB,
    
    PRIMARY KEY (time, tx_signature)
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('transaction_details', 'time');
```

### TimescaleDB Features

#### Hypertables
- `transaction_details`: All transaction data partitioned by time
- `price_feeds`: Price data from swaps (planned)
- `market_state_snapshots`: Periodic market state captures (planned)

#### Continuous Aggregates
Automatically maintained aggregated views for performance.

```sql
-- 1-minute price aggregates
CREATE MATERIALIZED VIEW price_feeds_1m
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 minute', time) AS bucket,
    pair_address,
    first(price0, time) AS open0,
    max(price0) AS high0,
    min(price0) AS low0,
    last(price0, time) AS close0,
    sum(volume_usd) AS volume,
    count(*) AS tx_count
FROM transaction_details
WHERE transaction_type = 'swap'
GROUP BY bucket, pair_address;

-- 1-hour transaction aggregates
CREATE MATERIALIZED VIEW transaction_details_1h
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', time) AS bucket,
    pair_address,
    transaction_type,
    count(*) AS tx_count,
    sum(volume_usd) AS total_volume,
    sum(fees_usd) AS total_fees,
    count(DISTINCT user_address) AS unique_users
FROM transaction_details
GROUP BY bucket, pair_address, transaction_type;
```

#### Compression Policies
Automatic compression for older data to save storage.

```sql
-- Compress data older than 7 days
SELECT add_compression_policy('transaction_details', INTERVAL '7 days');

-- Compress aggregates older than 30 days
SELECT add_compression_policy('price_feeds_1m', INTERVAL '30 days');
SELECT add_compression_policy('transaction_details_1h', INTERVAL '30 days');
```

#### Retention Policies
Automatic data retention policies.

```sql
-- Keep raw transaction data for 90 days
SELECT add_retention_policy('transaction_details', INTERVAL '90 days');

-- Keep 1-minute aggregates for 1 year
SELECT add_retention_policy('price_feeds_1m', INTERVAL '1 year');

-- Keep 1-hour aggregates for 2 years
SELECT add_retention_policy('transaction_details_1h', INTERVAL '2 years');
```

### Performance Indexes

```sql
-- Pair lookups
CREATE INDEX idx_pairs_tokens ON pairs (token0_address, token1_address);

-- User position lookups
CREATE INDEX idx_user_positions_user ON user_positions (user_address);
CREATE INDEX idx_user_positions_pair ON user_positions (pair_address);
CREATE INDEX idx_user_positions_updated ON user_positions (updated_at DESC);

-- Transaction queries
CREATE INDEX idx_transaction_details_pair_time ON transaction_details (pair_address, time DESC);
CREATE INDEX idx_transaction_details_user_time ON transaction_details (user_address, time DESC);
CREATE INDEX idx_transaction_details_type_time ON transaction_details (transaction_type, time DESC);
CREATE INDEX idx_transaction_details_signature ON transaction_details (tx_signature);

-- Composite indexes for common queries
CREATE INDEX idx_transactions_pair_type_time ON transaction_details (pair_address, transaction_type, time DESC);
CREATE INDEX idx_transactions_user_pair_time ON transaction_details (user_address, pair_address, time DESC);
```

## 🔧 Schema Management

### Using Drizzle ORM

#### Schema Definition

```typescript
// lib/schema.ts
import { pgTable, varchar, bigint, integer, timestamp, decimal, jsonb, smallint } from 'drizzle-orm/pg-core';

export const pairs = pgTable('pairs', {
  pairAddress: varchar('pair_address', { length: 44 }).primaryKey(),
  token0Address: varchar('token0_address', { length: 44 }).notNull(),
  token1Address: varchar('token1_address', { length: 44 }).notNull(),
  token0Decimals: smallint('token0_decimals').notNull(),
  token1Decimals: smallint('token1_decimals').notNull(),
  swapFeeBps: integer('swap_fee_bps').notNull(),
  halfLife: bigint('half_life', { mode: 'bigint' }).notNull(),
  poolDeployerFeeBps: integer('pool_deployer_fee_bps').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userPositions = pgTable('user_positions', {
  positionAddress: varchar('position_address', { length: 44 }).primaryKey(),
  userAddress: varchar('user_address', { length: 44 }).notNull(),
  pairAddress: varchar('pair_address', { length: 44 }).notNull().references(() => pairs.pairAddress),
  collateral0Amount: bigint('collateral0_amount', { mode: 'bigint' }).notNull().default(0),
  collateral1Amount: bigint('collateral1_amount', { mode: 'bigint' }).notNull().default(0),
  debt0Shares: bigint('debt0_shares', { mode: 'bigint' }).notNull().default(0),
  debt1Shares: bigint('debt1_shares', { mode: 'bigint' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactionDetails = pgTable('transaction_details', {
  time: timestamp('time', { withTimezone: true }).notNull(),
  txSignature: varchar('tx_signature', { length: 88 }).notNull(),
  slot: bigint('slot', { mode: 'bigint' }).notNull(),
  pairAddress: varchar('pair_address', { length: 44 }).notNull(),
  userAddress: varchar('user_address', { length: 44 }).notNull(),
  transactionType: varchar('transaction_type', { length: 20 }).notNull(),
  status: varchar('status', { length: 10 }).notNull().default('success'),
  amount0In: bigint('amount0_in', { mode: 'bigint' }).default(0),
  amount1In: bigint('amount1_in', { mode: 'bigint' }).default(0),
  amount0Out: bigint('amount0_out', { mode: 'bigint' }).default(0),
  amount1Out: bigint('amount1_out', { mode: 'bigint' }).default(0),
  price0: decimal('price0', { precision: 20, scale: 10 }),
  price1: decimal('price1', { precision: 20, scale: 10 }),
  volumeUsd: decimal('volume_usd', { precision: 20, scale: 6 }),
  feesUsd: decimal('fees_usd', { precision: 20, scale: 6 }),
  metadata: jsonb('metadata'),
}, (table) => ({
  pk: primaryKey({ columns: [table.time, table.txSignature] }),
}));
```

#### Type Inference

```typescript
// Infer types from schema
export type Pair = typeof pairs.$inferSelect;
export type NewPair = typeof pairs.$inferInsert;
export type UserPosition = typeof userPositions.$inferSelect;
export type NewUserPosition = typeof userPositions.$inferInsert;
export type TransactionDetail = typeof transactionDetails.$inferSelect;
export type NewTransactionDetail = typeof transactionDetails.$inferInsert;
```

### Migration Management

#### Generate Migrations

```bash
# Generate migration from schema changes
bun run migrate:create

# This creates a new migration file in migrations/
# Example: migrations/0003_add_new_table.sql
```

#### Apply Migrations

```bash
# Apply all pending migrations
bun run migrate

# Apply migrations to specific database
DATABASE_URL=postgresql://user:pass@host:5432/db bun run migrate
```

#### Migration Files

Migration files are automatically generated:

```sql
-- migrations/0001_initial.sql
CREATE TABLE IF NOT EXISTS "pairs" (
    "pair_address" varchar(44) PRIMARY KEY NOT NULL,
    "token0_address" varchar(44) NOT NULL,
    "token1_address" varchar(44) NOT NULL,
    -- ... other columns
);

CREATE TABLE IF NOT EXISTS "user_positions" (
    "position_address" varchar(44) PRIMARY KEY NOT NULL,
    "user_address" varchar(44) NOT NULL,
    "pair_address" varchar(44) NOT NULL,
    -- ... other columns
);

-- Add foreign key constraints
DO $$ BEGIN
 ALTER TABLE "user_positions" ADD CONSTRAINT "user_positions_pair_address_pairs_pair_address_fk" FOREIGN KEY ("pair_address") REFERENCES "pairs"("pair_address") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
```

## 🛠️ Development

### Database Connection

```typescript
// lib/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

### Common Queries

```typescript
import { db } from './database';
import { pairs, userPositions, transactionDetails } from './database/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';

// Get all pairs
const allPairs = await db.select().from(pairs);

// Get pair by address
const pair = await db.select().from(pairs).where(eq(pairs.pairAddress, pairAddress));

// Get user positions with pair info
const userPositionsWithPairs = await db
  .select({
    position: userPositions,
    pair: pairs,
  })
  .from(userPositions)
  .innerJoin(pairs, eq(userPositions.pairAddress, pairs.pairAddress))
  .where(eq(userPositions.userAddress, userAddress));

// Get recent transactions for a pair
const recentTransactions = await db
  .select()
  .from(transactionDetails)
  .where(eq(transactionDetails.pairAddress, pairAddress))
  .orderBy(desc(transactionDetails.time))
  .limit(100);

// Get transactions in time range
const transactionsInRange = await db
  .select()
  .from(transactionDetails)
  .where(
    and(
      eq(transactionDetails.pairAddress, pairAddress),
      gte(transactionDetails.time, startTime),
      lte(transactionDetails.time, endTime)
    )
  )
  .orderBy(desc(transactionDetails.time));
```

### Custom SQL Execution

```bash
# Run custom SQL file
bun run sql path/to/file.sql

# Interactive SQL runner
bun run sql
```

## 🚨 Backup and Recovery

### Database Backup

```bash
# Full database backup
pg_dump omnipair_indexer > backup_$(date +%Y%m%d_%H%M%S).sql

# Schema-only backup
pg_dump --schema-only omnipair_indexer > schema_backup.sql

# Data-only backup
pg_dump --data-only omnipair_indexer > data_backup.sql

# Compressed backup
pg_dump omnipair_indexer | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### TimescaleDB-specific Backup

```bash
# Backup with TimescaleDB chunks
pg_dump --format=custom omnipair_indexer > backup.dump

# Restore from custom format
pg_restore --dbname=omnipair_indexer backup.dump
```

## 📊 Monitoring and Maintenance

### Performance Monitoring

```sql
-- Check hypertable status
SELECT * FROM timescaledb_information.hypertables;

-- Check compression status
SELECT * FROM timescaledb_information.compression_settings;

-- Check continuous aggregates
SELECT * FROM timescaledb_information.continuous_aggregates;

-- Query performance stats
SELECT 
    schemaname,
    tablename,
    n_tup_ins,
    n_tup_upd,
    n_tup_del,
    n_live_tup,
    n_dead_tup
FROM pg_stat_user_tables
WHERE tablename IN ('pairs', 'user_positions', 'transaction_details');
```

### Maintenance Tasks

```sql
-- Update table statistics
ANALYZE pairs;
ANALYZE user_positions;
ANALYZE transaction_details;

-- Vacuum tables (usually automatic)
VACUUM ANALYZE transaction_details;

-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'transaction_details'
ORDER BY idx_scan DESC;
```

## 🚀 Deployment

### Production Configuration

```bash
# Production environment variables
DATABASE_URL=postgresql://user:pass@host:5432/omnipair_indexer
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_POOL_IDLE_TIMEOUT=30000
```

### Railway Deployment

Database migrations run automatically during deployment:

```bash
# In package.json
{
  "scripts": {
    "build": "bun run migrate:create",
    "start": "bun run migrate && echo 'Migrations complete'"
  }
}
```

---

**Note**: This database layer is designed to be shared between the Rust indexer daemon and TypeScript API server. The schema is optimized for both write-heavy indexing operations and read-heavy API queries.
