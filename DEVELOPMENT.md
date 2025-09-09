# Omnipair Indexer Development Guide

This guide provides comprehensive information for developers working on the Omnipair indexer, including architecture, development practices, and contribution guidelines.

## 🏗️ Architecture Overview

### System Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Solana RPC    │    │   WebSocket     │    │   HTTP API      │
│                 │    │   Monitoring    │    │   Endpoints     │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │     Omnipair Indexer      │
                    │                           │
                    │  ┌─────────────────────┐  │
                    │  │   Log Parser        │  │
                    │  │   Event Processor   │  │
                    │  │   Transaction       │  │
                    │  │   Processor         │  │
                    │  └─────────────────────┘  │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │     PostgreSQL +          │
                    │     TimescaleDB           │
                    │                           │
                    │  ┌─────────────────────┐  │
                    │  │   Raw Data          │  │
                    │  │   Time Series       │  │
                    │  │   Aggregates        │  │
                    │  └─────────────────────┘  │
                    └───────────────────────────┘
```

### Core Components

#### 1. Event System (`src/omnipair_indexer/events/`)
- **Purpose**: Define and validate Omnipair protocol events
- **Key Files**:
  - `index.ts`: Event definitions and type mappings
- **Responsibilities**:
  - Event schema validation
  - Transaction type classification
  - Event data transformation

#### 2. Log Parser (`src/omnipair_indexer/processors/logParser.ts`)
- **Purpose**: Extract events from Solana transaction logs
- **Responsibilities**:
  - Parse Anchor program logs
  - Extract event data
  - Handle different event types
  - Error handling and logging

#### 3. Transaction Processor (`src/omnipair_indexer/processors/transactionProcessor.ts`)
- **Purpose**: Process events and store in database
- **Responsibilities**:
  - Event processing logic
  - Database operations
  - User position updates
  - Price calculations

#### 4. Backfill System (`src/omnipair_indexer/backfill/`)
- **Purpose**: Historical data processing
- **Responsibilities**:
  - Transaction history retrieval
  - Batch processing
  - Rate limiting
  - Progress tracking

#### 5. Database Layer (`packages/database/`)
- **Purpose**: Data persistence and schema management
- **Responsibilities**:
  - Schema definitions
  - Migration management
  - TimescaleDB configuration
  - Query optimization

## 🛠️ Development Setup

### Prerequisites
- Node.js 18+
- Bun 1.0+
- PostgreSQL 14+ with TimescaleDB
- Git

### Local Development
```bash
# Clone repository
git clone <repository-url>
cd omnipair-indexer

# Install dependencies
bun install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Setup database
cd packages/database
bun run migrate
psql -U postgres -d omnipair_indexer -f sql/setup-timescaledb.sql
cd ../..

# Start development server
bun run dev
```

### Development Scripts
```bash
# Development with file watching
bun run dev

# Production build
bun run build

# Run tests
bun test

# Lint code
bun run lint

# Format code
bun run format

# Type check
bun run type-check
```

## 📁 Project Structure

```
src/
├── omnipair_indexer/
│   ├── backfill/
│   │   └── index.ts              # Backfill system
│   ├── events/
│   │   └── index.ts              # Event definitions
│   ├── processors/
│   │   ├── logParser.ts          # Log parsing
│   │   └── transactionProcessor.ts # Transaction processing
│   ├── analytics/                # Analytics utilities
│   └── index.ts                  # Main indexer
├── logger/
│   └── logger.ts                 # Logging configuration
├── connection.ts                 # Solana connection
└── index.ts                      # Application entry point

packages/
└── database/
    ├── lib/
    │   └── schema.ts             # Database schema
    ├── sql/
    │   └── setup-timescaledb.sql # TimescaleDB setup
    └── src/
        ├── index.ts              # Migration runner
        └── run-sql.ts            # SQL execution
```

## 🔧 Adding New Features

### Adding New Event Types

#### 1. Define Event Schema
```typescript
// src/omnipair_indexer/events/index.ts
export const NewEventType = BaseEvent.extend({
  type: z.literal("NewEventType"),
  newField: z.string(),
  amount: z.bigint(),
});

export type NewEventTypeType = z.infer<typeof NewEventType>;
```

#### 2. Add to Event Union
```typescript
export const OmnipairEvent = z.discriminatedUnion("type", [
  // ... existing events
  NewEventType,
]);
```

#### 3. Update Transaction Type Mapping
```typescript
export const getTransactionTypeFromEvent = (event: OmnipairEventType): string => {
  switch (event.type) {
    // ... existing cases
    case "NewEventType":
      return "new_transaction_type";
    default:
      return "unknown";
  }
};
```

#### 4. Add Log Parsing
```typescript
// src/omnipair_indexer/processors/logParser.ts
private parseNewEventType(logLine: string): OmnipairEventType | null {
  try {
    const dataMatch = logLine.match(/NewEventType\s*\{([^}]+)\}/);
    if (!dataMatch) return null;

    const data = this.parseEventData(dataMatch[1]);
    
    return {
      type: "NewEventType",
      user: data.user,
      newField: data.newField,
      amount: BigInt(data.amount || "0"),
      timestamp: parseInt(data.timestamp || "0"),
    };
  } catch (error) {
    logger.debug({ error, logLine }, "Failed to parse NewEventType");
    return null;
  }
}
```

#### 5. Update Transaction Processor
```typescript
// src/omnipair_indexer/processors/transactionProcessor.ts
private async processEventDetails(
  txSignature: string,
  blockTime: Date,
  pairAddress: string,
  userAddress: string,
  event: OmnipairEventType
) {
  // ... existing logic
  
  if (event.type === "NewEventType") {
    // Handle new event type
    await this.handleNewEventType(event);
  }
}
```

### Adding New Database Tables

#### 1. Define Schema
```typescript
// packages/database/lib/schema.ts
export const newTable = pgTable("new_table", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  field1: varchar("field1", { length: 44 }).notNull(),
  field2: bigint("field2", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
```

#### 2. Create Migration
```bash
cd packages/database
bun run migrate:create
```

#### 3. Update Exports
```typescript
// packages/database/lib/schema.ts
export * from "./schema";
```

### Adding New API Endpoints

#### 1. Define Route Handler
```typescript
// src/api/routes/newEndpoint.ts
export const newEndpointHandler = async (req: Request, res: Response) => {
  try {
    const { param1, param2 } = req.query;
    
    // Business logic
    const result = await processNewEndpoint(param1, param2);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
```

#### 2. Register Route
```typescript
// src/index.ts
app.get('/api/new-endpoint', newEndpointHandler);
```

## 🧪 Testing

### Unit Tests
```typescript
// tests/events.test.ts
import { describe, it, expect } from "bun:test";
import { SwapEvent, OmnipairEvent } from "../src/omnipair_indexer/events";

describe("Event Parsing", () => {
  it("should parse swap event correctly", () => {
    const eventData = {
      type: "SwapEvent",
      user: "USER123...",
      amount0_in: "1000000",
      amount1_in: "0",
      amount0_out: "0",
      amount1_out: "2000000",
      timestamp: 1640995200
    };

    const result = OmnipairEvent.parse(eventData);
    expect(result.type).toBe("SwapEvent");
    expect(result.amount0_in).toBe(BigInt("1000000"));
  });
});
```

### Integration Tests
```typescript
// tests/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { omnipairIndexer } from "../src/omnipair_indexer";

describe("Indexer Integration", () => {
  beforeAll(async () => {
    // Setup test database
  });

  afterAll(async () => {
    // Cleanup test database
  });

  it("should process transactions correctly", async () => {
    // Test transaction processing
  });
});
```

### Running Tests
```bash
# Run all tests
bun test

# Run specific test file
bun test tests/events.test.ts

# Run with coverage
bun test --coverage
```

## 📊 Performance Optimization

### Database Optimization
```sql
-- Add indexes for frequently queried columns
CREATE INDEX CONCURRENTLY idx_transaction_details_pair_time 
ON transaction_details (pair_address, time DESC);

-- Use partial indexes for filtered queries
CREATE INDEX CONCURRENTLY idx_transaction_details_swaps 
ON transaction_details (time DESC) 
WHERE transaction_type = 'swap';

-- Optimize TimescaleDB compression
SELECT add_compression_policy('transaction_details', INTERVAL '7 days');
```

### Memory Optimization
```typescript
// Use streaming for large datasets
const stream = db.select().from(transactions).stream();

// Implement pagination
const limit = 1000;
const offset = 0;
const results = await db.select()
  .from(transactions)
  .limit(limit)
  .offset(offset);
```

### RPC Optimization
```typescript
// Implement connection pooling
const connectionPool = new ConnectionPool({
  maxConnections: 10,
  rpcUrl: process.env.SOLANA_RPC_URL,
  wsUrl: process.env.SOLANA_WS_URL
});

// Use batch requests
const signatures = await connection.getSignaturesForAddress(
  programId,
  { limit: 1000 },
  "confirmed"
);
```

## 🔍 Debugging

### Logging
```typescript
// Use structured logging
logger.info({
  txSignature,
  eventCount: events.length,
  processingTime: Date.now() - startTime
}, "Transaction processed successfully");

// Use different log levels
logger.debug("Detailed debug information");
logger.info("General information");
logger.warn("Warning message");
logger.error({ error }, "Error occurred");
```

### Database Debugging
```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM transaction_details 
WHERE pair_address = 'ABC123...' 
ORDER BY time DESC LIMIT 100;

-- Monitor active queries
SELECT * FROM pg_stat_activity 
WHERE state = 'active';

-- Check TimescaleDB status
SELECT * FROM timescaledb_information.hypertables;
```

### RPC Debugging
```typescript
// Log RPC calls
const originalGetTransaction = connection.getTransaction;
connection.getTransaction = async (signature, options) => {
  logger.debug({ signature, options }, "RPC: getTransaction");
  const result = await originalGetTransaction.call(connection, signature, options);
  logger.debug({ signature, result: !!result }, "RPC: getTransaction result");
  return result;
};
```

## 🚀 Deployment

### Environment Configuration
```bash
# Production environment variables
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=postgresql://user:pass@host:5432/db
SOLANA_RPC_URL=https://your-rpc-endpoint.com
SOLANA_WS_URL=wss://your-ws-endpoint.com
```

### Docker Deployment
```dockerfile
FROM oven/bun:1-slim

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "start"]
```

### Health Checks
```typescript
// Implement health checks
const healthCheck = async () => {
  try {
    // Check database connection
    await db.select().from(transactions).limit(1);
    
    // Check RPC connection
    await connection.getHealth();
    
    return { status: "healthy" };
  } catch (error) {
    return { status: "unhealthy", error: error.message };
  }
};
```

## 📝 Code Style

### TypeScript Guidelines
```typescript
// Use strict typing
interface TransactionData {
  signature: string;
  slot: number;
  blockTime: Date;
}

// Use enums for constants
enum TransactionType {
  SWAP = "swap",
  BORROW = "borrow"
}

// Use type guards
function isSwapEvent(event: OmnipairEventType): event is SwapEventType {
  return event.type === "SwapEvent";
}
```

### Error Handling
```typescript
// Use Result types for error handling
type Result<T, E = Error> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};

// Implement proper error boundaries
try {
  const result = await processTransaction(tx);
  return { success: true, data: result };
} catch (error) {
  logger.error({ error, tx }, "Failed to process transaction");
  return { success: false, error: error as Error };
}
```

## 🤝 Contributing

### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Update documentation
6. Submit a pull request

### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Performance implications considered
- [ ] Error handling is proper
- [ ] Logging is appropriate

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## 📚 Resources

### Documentation
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [TimescaleDB](https://docs.timescale.com/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Bun](https://bun.sh/docs)

### Tools
- [Solana Explorer](https://explorer.solana.com/)
- [Anchor Book](https://book.anchor-lang.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

**Note**: This development guide is a living document. Please keep it updated as the project evolves.

