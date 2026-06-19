# Omnipair Indexer Development Guide

This guide provides comprehensive information for developers working on the Omnipair indexer's hybrid Rust/TypeScript architecture.

## 🏗️ Architecture Overview

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Web Apps      │  │   Mobile Apps   │  │   Analytics     │  │
│  │                 │  │                 │  │   Dashboards    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────┬───────────────────────────────────┘
                              │ HTTP/REST API
┌─────────────────────────────▼───────────────────────────────────┐
│                      API Layer                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │           TypeScript API Server (Bun)                      │ │
│  │                                                             │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │ │
│  │  │   Routes    │ │  Services   │ │     Middleware      │   │ │
│  │  │             │ │             │ │                     │   │ │
│  │  │ • Health    │ │ • Pairs     │ │ • Authentication    │   │ │
│  │  │ • Pairs     │ │ • Positions │ │ • Rate Limiting     │   │ │
│  │  │ • Users     │ │ • Analytics │ │ • CORS              │   │ │
│  │  │ • Analytics │ │ • Prices    │ │ • Validation        │   │ │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │ SQL Queries (Drizzle ORM)
┌─────────────────────────────▼───────────────────────────────────┐
│                    Database Layer                               │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              PostgreSQL + TimescaleDB                      │ │
│  │                                                             │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │ │
│  │  │    Core     │ │ Time-Series │ │    Aggregates       │   │ │
│  │  │   Tables    │ │ Hypertables │ │   & Analytics       │   │ │
│  │  │             │ │             │ │                     │   │ │
│  │  │ • Pairs     │ │ • Txns      │ │ • Price Feeds       │   │ │
│  │  │ • Positions │ │ • Events    │ │ • Volume Stats      │   │ │
│  │  │ • Config    │ │ • Logs      │ │ • User Metrics      │   │ │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Database Writes
┌─────────────────────────────▼───────────────────────────────────┐
│                   Indexing Layer                                │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │              Rust Indexer Daemon (Carbon)                  │ │
│  │                                                             │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐   │ │
│  │  │ Datasources │ │  Processors │ │      Decoders       │   │ │
│  │  │             │ │             │ │                     │   │ │
│  │  │ • RPC Poll  │ │ • Accounts  │ │ • Omnipair Proto    │   │ │
│  │  │ • WebSocket │ │ • Events    │ │ • Instructions      │   │ │
│  │  │ • Backfill  │ │ • Metrics   │ │ • Account Types     │   │ │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────────┘
                              │ RPC/WebSocket
┌─────────────────────────────▼───────────────────────────────────┐
│                     Solana Network                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   RPC Nodes     │  │   WebSocket     │  │   Omnipair      │  │
│  │                 │  │   Endpoints     │  │   Program       │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
omnipair-indexer/
├── Cargo.toml                    # Rust workspace configuration
├── package.json                  # Node.js workspace configuration
├── README.md                     # Main project documentation
├── QUICKSTART.md                 # Quick setup guide
├── DEVELOPMENT.md                # This file
│
├── indexer/                      # 🦀 Rust Indexer Daemon
│   ├── Cargo.toml               # Package configuration
│   ├── railway.toml             # Railway deployment config
│   ├── src/
│   │   └── main.rs              # Main daemon application
│   ├── crates/                  # Carbon framework crates
│   │   ├── core/                # Core pipeline functionality
│   │   ├── macros/              # Helper macros
│   │   ├── proc-macros/         # Procedural macros
│   │   └── test-utils/          # Testing utilities
│   ├── datasources/             # Data source implementations
│   │   └── rpc-program-subscribe-datasource/
│   ├── src/omnipair_decoder_adapter.rs # Bridge to the published omnipair-decoder crate
│   ├── metrics/                 # Metrics implementations
│   │   ├── log-metrics/         # Structured logging
│   │   └── prometheus-metrics/  # Prometheus integration (planned)
│   └── README.md                # Indexer documentation
│
├── api/                         # 📡 TypeScript API Server
│   ├── package.json             # API dependencies
│   ├── railway.toml             # Railway deployment config
│   ├── tsconfig.json            # TypeScript configuration
│   ├── src/                     # Source code
│   │   ├── index.ts             # Main server entry point
│   │   ├── routes/              # API route handlers
│   │   │   ├── health.ts        # Health endpoints
│   │   │   ├── pairs.ts         # Pair endpoints
│   │   │   ├── positions.ts     # Position endpoints
│   │   │   ├── transactions.ts  # Transaction endpoints
│   │   │   └── analytics.ts     # Analytics endpoints
│   │   ├── services/            # Business logic
│   │   │   ├── pairService.ts   # Pair operations
│   │   │   ├── positionService.ts # Position calculations
│   │   │   ├── priceService.ts  # Price feed operations
│   │   │   └── analyticsService.ts # Analytics
│   │   ├── middleware/          # Express middleware
│   │   │   ├── auth.ts          # Authentication
│   │   │   ├── rateLimit.ts     # Rate limiting
│   │   │   ├── cors.ts          # CORS configuration
│   │   │   └── validation.ts    # Request validation
│   │   ├── types/               # TypeScript definitions
│   │   │   ├── api.ts           # API types
│   │   │   ├── database.ts      # Database types
│   │   │   └── omnipair.ts      # Protocol types
│   │   └── utils/               # Utilities
│   │       ├── logger.ts        # Logging
│   │       ├── cache.ts         # Caching
│   │       └── validation.ts    # Validation helpers
│   ├── tests/                   # Test files
│   │   ├── integration/         # Integration tests
│   │   ├── unit/               # Unit tests
│   │   └── fixtures/           # Test data
│   └── README.md                # API documentation
│
├── database/                    # 🗄️ Database Layer
│   ├── package.json             # Database dependencies
│   ├── drizzle.config.ts        # Drizzle configuration
│   ├── tsconfig.json            # TypeScript config
│   ├── lib/                     # Library exports
│   │   ├── index.ts             # Main exports
│   │   └── schema.ts            # Schema definitions
│   ├── src/                     # Source code
│   │   ├── index.ts             # Migration runner
│   │   └── run-sql.ts           # SQL utilities
│   ├── migrations/              # Generated migrations
│   │   ├── 0001_initial.sql     # Initial schema
│   │   └── meta/                # Migration metadata
│   ├── sql/                     # Custom SQL scripts
│   │   ├── setup-timescaledb.sql # TimescaleDB setup
│   │   ├── indexes.sql          # Performance indexes
│   │   └── views.sql            # Database views
│   └── README.md                # Database documentation
│
└── docs/                        # 📚 Additional Documentation
    ├── architecture.md          # Architecture deep-dive
    ├── deployment.md            # Deployment guides
    └── troubleshooting.md       # Common issues
```

## 🛠️ Development Setup

### Prerequisites

- **Rust 1.82+**: [rustup.rs](https://rustup.rs/)
- **Bun 1.0+**: [bun.sh](https://bun.sh/)
- **PostgreSQL 14+**: With TimescaleDB extension
- **Git**: Version control
- **IDE**: VS Code with Rust Analyzer and TypeScript extensions

### Initial Setup

```bash
# Clone repository
git clone <repository-url>
cd omnipair-indexer

# Install dependencies
bun install

# Setup database
createdb omnipair_indexer
psql omnipair_indexer -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Run migrations
cd database && bun run migrate
psql omnipair_indexer -f sql/setup-timescaledb.sql
cd ..

# Configure environment
cp env.template .env
# Edit .env with your settings
```

### Development Workflow

#### 1. Indexer Development (Rust)

```bash
# Build and run
cargo build -p omnipair-carbon-indexer
cargo run -p omnipair-carbon-indexer

# Development with auto-reload
cargo install cargo-watch
cargo watch -x "run -p omnipair-carbon-indexer"

# Testing
cargo test
cargo test --package omnipair-carbon-indexer

# Code quality
cargo fmt
cargo clippy
cargo clippy -- -D warnings
```

#### 2. API Development (TypeScript)

```bash
# Development server
cd api
bun run dev

# Build and run
bun run build
bun run start

# Testing
bun test
bun test --watch

# Code quality
bun run lint
bun run type-check
bun run format
```

#### 3. Database Development

```bash
# Create migration
cd database
bun run migrate:create

# Apply migrations
bun run migrate

# Run custom SQL
bun run sql path/to/script.sql

# Reset database (development only)
dropdb omnipair_indexer && createdb omnipair_indexer
psql omnipair_indexer -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
bun run migrate
```

## 🔧 Adding New Features

### Adding New Event Types

#### 1. Bump The Published Rust Decoder

```rust
// Cargo.toml
omnipair-decoder = { version = "=<new-version>" }
```

The indexer consumes Omnipair layouts from the published `omnipair-decoder`
crate. Do not hand-edit the legacy generated decoder; bump the crate version,
then update `indexer/src/omnipair_decoder_adapter.rs`, processors, and database
handlers if the new IDL adds or renames events.

#### 2. Add Event Processing

```rust
// indexer/src/main.rs
pub struct NewEventProcessor;

#[async_trait]
impl Processor for NewEventProcessor {
    type InputType = InstructionProcessorInputType<NewEvent>;
    
    async fn process(&mut self, update: Self::InputType, metrics: Arc<MetricsCollection>) -> CarbonResult<()> {
        let (metadata, instruction, _raw_instruction) = update;
        
        // Process the new event
        log::info!("Processing new event: {:?}", instruction);
        
        // TODO: Add database write logic when database integration is ready
        
        Ok(())
    }
}
```

#### 3. Update Database Schema

```typescript
// database/lib/schema.ts
export const newEvents = pgTable('new_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  txSignature: varchar('tx_signature', { length: 88 }).notNull(),
  userAddress: varchar('user_address', { length: 44 }).notNull(),
  amount: bigint('amount', { mode: 'bigint' }).notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

#### 4. Add API Endpoint

```typescript
// api/src/routes/newEvents.ts
import { Request, Response } from 'express';
import { db } from '../database';
import { newEvents } from '../database/schema';

export const getNewEvents = async (req: Request, res: Response) => {
  try {
    const events = await db.select().from(newEvents).limit(100);
    
    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
```

### Adding New API Endpoints

#### 1. Create Route Handler

```typescript
// api/src/routes/newEndpoint.ts
import { Request, Response } from 'express';
import { z } from 'zod';

const QuerySchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
});

export const newEndpointHandler = async (req: Request, res: Response) => {
  try {
    const query = QuerySchema.parse(req.query);
    
    // Business logic here
    const result = await processNewEndpoint(query);
    
    res.json({
      success: true,
      data: result,
      pagination: {
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
```

#### 2. Register Route

```typescript
// api/src/index.ts
import { newEndpointHandler } from './routes/newEndpoint';

app.get('/api/new-endpoint', newEndpointHandler);
```

#### 3. Add Tests

```typescript
// api/tests/integration/newEndpoint.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import request from 'supertest';
import { app } from '../../src/index';

describe('New Endpoint', () => {
  it('should return data successfully', async () => {
    const response = await request(app)
      .get('/api/new-endpoint')
      .query({ limit: 10 })
      .expect(200);
      
    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
  });
});
```

### Adding Database Migrations

#### 1. Schema Changes

```typescript
// database/lib/schema.ts
export const newTable = pgTable('new_table', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  value: decimal('value', { precision: 20, scale: 6 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

#### 2. Generate Migration

```bash
cd database
bun run migrate:create
```

#### 3. Custom Migration (if needed)

```sql
-- database/migrations/0003_custom_changes.sql
-- Add custom indexes
CREATE INDEX CONCURRENTLY idx_new_table_name ON new_table (name);

-- Add TimescaleDB hypertable
SELECT create_hypertable('time_series_table', 'timestamp');

-- Add compression policy
SELECT add_compression_policy('time_series_table', INTERVAL '7 days');
```

## 🧪 Testing

### Rust Testing

```bash
# Run all tests
cargo test

# Run specific package tests
cargo test -p omnipair-carbon-indexer

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_account_processing

# Integration tests
cargo test --test integration_tests
```

### TypeScript Testing

```bash
# Run all tests
cd api && bun test

# Run with watch mode
bun test --watch

# Run specific test file
bun test src/routes/pairs.test.ts

# Run integration tests
bun test tests/integration/

# Coverage report
bun test --coverage
```

### Database Testing

```bash
# Test migrations
cd database
DATABASE_URL=postgresql://test_user:test_pass@localhost/test_db bun run migrate

# Test schema generation
bun run migrate:create

# Validate schema
bun run validate-schema
```

## 📊 Performance Optimization

### Rust Indexer Optimization

#### 1. Memory Management

```rust
// Use Arc for shared data
use std::sync::Arc;

// Implement efficient batching
const BATCH_SIZE: usize = 1000;
let mut batch = Vec::with_capacity(BATCH_SIZE);

// Use channels for async communication
let (sender, receiver) = tokio::sync::mpsc::channel(1000);
```

#### 2. Database Connection Pooling

```rust
// Future implementation for database integration
use sqlx::PgPool;

let pool = PgPool::connect_with(
    PgConnectOptions::new()
        .max_connections(10)
        .min_connections(2)
        .idle_timeout(Duration::from_secs(30))
).await?;
```

### API Server Optimization

#### 1. Database Query Optimization

```typescript
// Use indexes effectively
const results = await db
  .select()
  .from(transactionDetails)
  .where(
    and(
      eq(transactionDetails.pairAddress, pairAddress),
      gte(transactionDetails.time, startTime)
    )
  )
  .orderBy(desc(transactionDetails.time))
  .limit(100);

// Use prepared statements for repeated queries
const getRecentTransactions = db
  .select()
  .from(transactionDetails)
  .where(eq(transactionDetails.pairAddress, $pairAddress))
  .orderBy(desc(transactionDetails.time))
  .limit($limit)
  .prepare();
```

#### 2. Caching Strategy

```typescript
// Redis caching (planned)
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache frequently accessed data
const cacheKey = `pairs:${pairAddress}`;
const cached = await redis.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const data = await fetchPairData(pairAddress);
await redis.setex(cacheKey, 300, JSON.stringify(data)); // 5 min cache
```

### Database Optimization

#### 1. TimescaleDB Configuration

```sql
-- Optimize chunk intervals
SELECT set_chunk_time_interval('transaction_details', INTERVAL '1 day');

-- Enable compression
ALTER TABLE transaction_details SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'pair_address',
  timescaledb.compress_orderby = 'time DESC'
);

-- Add compression policy
SELECT add_compression_policy('transaction_details', INTERVAL '7 days');
```

#### 2. Index Strategy

```sql
-- Composite indexes for common queries
CREATE INDEX CONCURRENTLY idx_transactions_pair_time_type 
ON transaction_details (pair_address, time DESC, transaction_type);

-- Partial indexes for filtered queries
CREATE INDEX CONCURRENTLY idx_transactions_swaps 
ON transaction_details (time DESC) 
WHERE transaction_type = 'swap';

-- BRIN indexes for time-series data
CREATE INDEX CONCURRENTLY idx_transactions_time_brin 
ON transaction_details USING BRIN (time);
```

## 🚀 Deployment

### Railway Deployment

#### 1. Service Configuration

Each service has its own `railway.toml`:

```toml
# indexer/railway.toml
[build]
builder = "nixpacks"
buildCommand = "cargo build --release"

[deploy]
startCommand = "./target/release/omnipair-carbon-indexer"
restartPolicyType = "always"
numReplicas = 1

# api/railway.toml
[build]
builder = "nixpacks"
buildCommand = "bun install"

[deploy]
startCommand = "bun run start"
restartPolicyType = "always"
numReplicas = 1
```

#### 2. Environment Variables

```bash
# Shared across services
DATABASE_URL=${{Postgres.DATABASE_URL}}
SOLANA_RPC_URL=https://your-premium-rpc.com
SOLANA_WS_URL=wss://your-premium-ws.com

# Service-specific variables
RUST_LOG=info                    # Indexer
NODE_ENV=production              # API
PORT=3000                        # API
```

### Docker Deployment (Planned)

```dockerfile
# Dockerfile.indexer
FROM rust:1.82-slim as builder
WORKDIR /app
COPY . .
RUN cargo build --release -p omnipair-carbon-indexer

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/omnipair-carbon-indexer /usr/local/bin/
CMD ["omnipair-carbon-indexer"]

# Dockerfile.api
FROM oven/bun:1-slim
WORKDIR /app
COPY api/package.json api/bun.lockb ./
RUN bun install --frozen-lockfile
COPY api/ .
EXPOSE 3000
CMD ["bun", "run", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: timescale/timescaledb:latest-pg14
    environment:
      POSTGRES_DB: omnipair_indexer
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  indexer:
    build:
      context: .
      dockerfile: Dockerfile.indexer
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/omnipair_indexer
      RPC_URL: https://api.mainnet-beta.solana.com
      RPC_WS_URL: wss://api.mainnet-beta.solana.com
      RUST_LOG: info
    depends_on:
      - postgres

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/omnipair_indexer
      NODE_ENV: production
      PORT: 3000
    ports:
      - "3000:3000"
    depends_on:
      - postgres

volumes:
  postgres_data:
```

## 🔍 Debugging and Monitoring

### Logging Configuration

#### Rust Indexer

```bash
# Different log levels
RUST_LOG=debug cargo run -p omnipair-carbon-indexer
RUST_LOG=carbon_core=debug,omnipair_carbon_indexer=info cargo run

# Structured JSON logging
RUST_LOG=info cargo run 2>&1 | jq '.'
```

#### TypeScript API

```typescript
// api/src/utils/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  },
});

// Usage
logger.info({ pairAddress, volume }, 'Processing pair data');
logger.error({ error: error.message, stack: error.stack }, 'API error');
```

### Health Monitoring

```typescript
// api/src/routes/health.ts
export const healthCheck = async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: await checkDatabaseHealth(),
      indexer: await checkIndexerHealth(),
    },
    metrics: {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    },
  };
  
  res.json(health);
};
```

### Performance Monitoring

```sql
-- Database performance queries
SELECT 
  schemaname,
  tablename,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  n_live_tup,
  n_dead_tup
FROM pg_stat_user_tables
ORDER BY n_tup_ins DESC;

-- Index usage statistics
SELECT 
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- TimescaleDB chunk information
SELECT 
  chunk_schema,
  chunk_name,
  range_start,
  range_end
FROM timescaledb_information.chunks
WHERE hypertable_name = 'transaction_details'
ORDER BY range_start DESC;
```

## 🤝 Contributing Guidelines

### Code Style

#### Rust
- Use `cargo fmt` for formatting
- Run `cargo clippy` and fix all warnings
- Follow Rust naming conventions
- Add documentation comments for public APIs
- Write tests for new functionality

#### TypeScript
- Use Prettier for formatting
- Follow ESLint rules
- Use strict TypeScript configuration
- Add JSDoc comments for complex functions
- Write unit and integration tests

### Pull Request Process

1. **Fork and Branch**: Create a feature branch from `main`
2. **Development**: Make changes following style guidelines
3. **Testing**: Add tests and ensure all tests pass
4. **Documentation**: Update relevant documentation
5. **Review**: Submit PR with clear description
6. **Integration**: Squash merge after approval

### Commit Messages

Use conventional commits format:

```
feat(indexer): add new event type processing
fix(api): resolve pagination issue in pairs endpoint
docs(database): update schema documentation
refactor(api): improve error handling middleware
test(indexer): add integration tests for account processing
```

---

**Note**: This development guide is a living document. Please keep it updated as the project evolves and new patterns emerge.
