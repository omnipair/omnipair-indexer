# Omnipair API Server (TypeScript)

A high-performance TypeScript API server that provides REST endpoints for querying Omnipair protocol data indexed by the Rust daemon.

## 🏗️ Architecture

The API server is built with:

- **TypeScript + Bun**: Fast JavaScript runtime with excellent TypeScript support
- **Drizzle ORM**: Type-safe database queries with excellent performance
- **PostgreSQL/TimescaleDB**: Time-series optimized data storage
- **RESTful Design**: Clean, predictable API endpoints
- **Caching Layer**: Redis-based caching for frequently accessed data (planned)

### Data Flow

```
Client Requests → API Server → Database Queries → Response Transformation → JSON Response
```

## 📁 Project Structure

```
api/
├── package.json              # Node.js dependencies
├── railway.toml              # Railway deployment config
├── tsconfig.json            # TypeScript configuration
├── src/
│   ├── index.ts             # Main server entry point
│   ├── routes/              # API route handlers
│   │   ├── health.ts        # Health check endpoints
│   │   ├── pairs.ts         # Pair-related endpoints
│   │   ├── positions.ts     # User position endpoints
│   │   ├── transactions.ts  # Transaction history endpoints
│   │   └── analytics.ts     # Analytics and metrics endpoints
│   ├── services/            # Business logic services
│   │   ├── pairService.ts   # Pair data operations
│   │   ├── positionService.ts # Position calculations
│   │   ├── priceService.ts  # Price feed operations
│   │   └── analyticsService.ts # Analytics calculations
│   ├── middleware/          # Express middleware
│   │   ├── auth.ts          # Authentication middleware
│   │   ├── rateLimit.ts     # Rate limiting
│   │   ├── cors.ts          # CORS configuration
│   │   └── validation.ts    # Request validation
│   ├── types/               # TypeScript type definitions
│   │   ├── api.ts           # API request/response types
│   │   ├── database.ts      # Database entity types
│   │   └── omnipair.ts      # Omnipair protocol types
│   └── utils/               # Utility functions
│       ├── logger.ts        # Structured logging
│       ├── cache.ts         # Caching utilities
│       └── validation.ts    # Data validation helpers
└── tests/                   # Test files
    ├── integration/         # Integration tests
    ├── unit/               # Unit tests
    └── fixtures/           # Test data fixtures
```

## 🚀 Getting Started

### Prerequisites

- **Bun 1.0+**: Install from [bun.sh](https://bun.sh/)
- **Node.js 18+**: For compatibility (optional with Bun)
- **PostgreSQL 14+**: With TimescaleDB extension
- **Running Indexer**: The Rust indexer should be feeding data

### Environment Variables

Create a `.env` file in the api directory:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/omnipair_indexer

# Logging Configuration
LOG_LEVEL=info

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Caching (Redis - planned)
REDIS_URL=redis://localhost:6379

# Authentication (planned)
JWT_SECRET=your-super-secret-jwt-key
API_KEY_REQUIRED=false
```

### Install and Run

```bash
# From the api directory
cd api

# Install dependencies
bun install

# Run in development mode
bun run dev

# Run in production mode
bun run start

# Or run from workspace root
cd ../
bun run api:dev
```

## 📡 API Endpoints

### Health and Status

#### GET `/health`
Basic health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": "connected",
  "indexer": "active"
}
```

#### GET `/status`
Detailed system status.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "database": {
      "status": "connected",
      "latency": 5,
      "lastQuery": "2024-01-01T00:00:00.000Z"
    },
    "indexer": {
      "status": "active",
      "lastUpdate": "2024-01-01T00:00:00.000Z",
      "processedTransactions": 150000
    }
  },
  "metrics": {
    "requestsPerMinute": 45,
    "averageResponseTime": 120,
    "errorRate": 0.1
  }
}
```

### Pair Endpoints

#### GET `/pairs`
Get all Omnipair trading pairs.

**Query Parameters:**
- `limit` (optional): Number of results (default: 100, max: 1000)
- `offset` (optional): Number to skip (default: 0)
- `sortBy` (optional): Sort field (`createdAt`, `volume24h`, `tvl`)
- `sortOrder` (optional): Sort direction (`asc`, `desc`)

**Response:**
```json
{
  "pairs": [
    {
      "pairAddress": "ABC123...",
      "token0Address": "TOK0...",
      "token1Address": "TOK1...",
      "token0Decimals": 6,
      "token1Decimals": 9,
      "swapFeeBps": 30,
      "halfLife": 86400,
      "poolDeployerFeeBps": 10,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "metrics": {
        "volume24h": "1000000.50",
        "tvl": "5000000.00",
        "apy": 12.5
      }
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 100,
    "offset": 0,
    "hasNext": false
  }
}
```

#### GET `/pairs/:pairAddress`
Get detailed information about a specific pair.

**Response:**
```json
{
  "pairAddress": "ABC123...",
  "token0Address": "TOK0...",
  "token1Address": "TOK1...",
  "token0Decimals": 6,
  "token1Decimals": 9,
  "swapFeeBps": 30,
  "halfLife": 86400,
  "poolDeployerFeeBps": 10,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "currentState": {
    "token0Reserves": "1000000000000",
    "token1Reserves": "2000000000000",
    "totalShares": "1414213562373",
    "price0": "2.0",
    "price1": "0.5"
  },
  "metrics": {
    "volume24h": "1000000.50",
    "volume7d": "7500000.25",
    "volume30d": "30000000.00",
    "tvl": "5000000.00",
    "apy": 12.5,
    "transactions24h": 150
  }
}
```

#### GET `/pairs/:pairAddress/price-history`
Get price history for a trading pair.

**Query Parameters:**
- `from` (optional): Start timestamp (ISO 8601)
- `to` (optional): End timestamp (ISO 8601)
- `interval` (optional): Time interval (`1m`, `5m`, `15m`, `1h`, `4h`, `1d`)
- `limit` (optional): Number of data points (default: 100)

**Response:**
```json
{
  "pairAddress": "ABC123...",
  "interval": "1h",
  "priceHistory": [
    {
      "timestamp": "2024-01-01T00:00:00.000Z",
      "price0": "2.0",
      "price1": "0.5",
      "volume": "50000.25",
      "high0": "2.1",
      "low0": "1.9",
      "open0": "2.0",
      "close0": "2.0"
    }
  ],
  "pagination": {
    "total": 24,
    "limit": 100,
    "hasNext": false
  }
}
```

### User Position Endpoints

#### GET `/users/:userAddress/positions`
Get user positions across all pairs.

**Query Parameters:**
- `pairAddress` (optional): Filter by specific pair
- `status` (optional): Filter by status (`active`, `liquidated`, `closed`)
- `includeHistory` (optional): Include position history (boolean)

**Response:**
```json
{
  "userAddress": "USER123...",
  "positions": [
    {
      "positionAddress": "POS123...",
      "pairAddress": "ABC123...",
      "collateral0Amount": "1000000",
      "collateral1Amount": "2000000",
      "debt0Shares": "500000",
      "debt1Shares": "0",
      "collateralValue": "1500.00",
      "debtValue": "500.00",
      "healthFactor": "3.0",
      "status": "active",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "summary": {
    "totalPositions": 1,
    "totalCollateralValue": "1500.00",
    "totalDebtValue": "500.00",
    "averageHealthFactor": "3.0"
  }
}
```

#### GET `/positions/:positionAddress`
Get detailed information about a specific position.

**Response:**
```json
{
  "positionAddress": "POS123...",
  "userAddress": "USER123...",
  "pairAddress": "ABC123...",
  "collateral0Amount": "1000000",
  "collateral1Amount": "2000000",
  "debt0Shares": "500000",
  "debt1Shares": "0",
  "collateralValue": "1500.00",
  "debtValue": "500.00",
  "healthFactor": "3.0",
  "liquidationThreshold": "1.2",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "riskMetrics": {
    "timeToLiquidation": "7d",
    "maxWithdrawable0": "500000",
    "maxWithdrawable1": "1000000",
    "maxBorrowable0": "200000",
    "maxBorrowable1": "400000"
  }
}
```

### Transaction Endpoints

#### GET `/transactions`
Get recent transactions across all pairs.

**Query Parameters:**
- `pairAddress` (optional): Filter by pair
- `userAddress` (optional): Filter by user
- `type` (optional): Filter by type (`swap`, `borrow`, `repay`, etc.)
- `from` (optional): Start timestamp
- `to` (optional): End timestamp
- `limit` (optional): Number of results (default: 100)
- `offset` (optional): Number to skip (default: 0)

**Response:**
```json
{
  "transactions": [
    {
      "txSignature": "TX123...",
      "blockTime": "2024-01-01T00:00:00.000Z",
      "slot": 250000000,
      "userAddress": "USER123...",
      "pairAddress": "ABC123...",
      "transactionType": "swap",
      "status": "success",
      "amount0In": "1000000",
      "amount1In": "0",
      "amount0Out": "0",
      "amount1Out": "2000000",
      "price0": "2.0",
      "price1": "0.5",
      "volumeUsd": "100.50",
      "feesUsd": "0.30"
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 100,
    "offset": 0,
    "hasNext": false
  }
}
```

### Analytics Endpoints

#### GET `/analytics/overview`
Get protocol-wide analytics.

**Query Parameters:**
- `period` (optional): Time period (`24h`, `7d`, `30d`, `90d`)

**Response:**
```json
{
  "period": "24h",
  "metrics": {
    "totalVolume": "10000000.00",
    "totalTvl": "50000000.00",
    "totalTransactions": 1500,
    "activeUsers": 250,
    "activePairs": 15
  },
  "changes": {
    "volumeChange": "+5.2%",
    "tvlChange": "+2.1%",
    "transactionChange": "+8.5%",
    "userChange": "+1.2%"
  }
}
```

#### GET `/analytics/pairs/:pairAddress`
Get analytics for a specific pair.

**Query Parameters:**
- `period` (optional): Time period (`24h`, `7d`, `30d`, `90d`)
- `metrics` (optional): Comma-separated metrics (`volume`, `tvl`, `fees`, `apy`)

**Response:**
```json
{
  "pairAddress": "ABC123...",
  "period": "24h",
  "metrics": {
    "volume": {
      "total": "1000000.0",
      "change": "+5.2%"
    },
    "tvl": {
      "current": "5000000.0",
      "change": "+2.1%"
    },
    "fees": {
      "total": "3000.0",
      "change": "+8.5%"
    },
    "apy": {
      "current": 12.5,
      "average": 10.8
    }
  }
}
```

## 🔧 Development

### Adding New Endpoints

1. **Create Route Handler**:
```typescript
// src/routes/newEndpoint.ts
import { Request, Response } from 'express';
import { z } from 'zod';

const QuerySchema = z.object({
  param1: z.string().optional(),
  param2: z.number().optional(),
});

export const newEndpointHandler = async (req: Request, res: Response) => {
  try {
    const query = QuerySchema.parse(req.query);
    
    // Business logic
    const result = await processNewEndpoint(query);
    
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

2. **Register Route**:
```typescript
// src/index.ts
import { newEndpointHandler } from './routes/newEndpoint';

app.get('/api/new-endpoint', newEndpointHandler);
```

### Database Queries

Use Drizzle ORM for type-safe database operations:

```typescript
import { db } from '../database';
import { pairs, userPositions } from '../database/schema';
import { eq, desc, and } from 'drizzle-orm';

// Simple query
const allPairs = await db.select().from(pairs);

// Complex query with joins
const userPositionsWithPairs = await db
  .select({
    position: userPositions,
    pair: pairs,
  })
  .from(userPositions)
  .innerJoin(pairs, eq(userPositions.pairAddress, pairs.pairAddress))
  .where(eq(userPositions.userAddress, userAddress))
  .orderBy(desc(userPositions.updatedAt));
```

### Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/routes/pairs.test.ts

# Run with coverage
bun test --coverage

# Integration tests
bun test tests/integration/
```

## 🚨 Error Handling

### Standard Error Format

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid parameter value",
    "details": {
      "field": "pairAddress",
      "value": "invalid",
      "expected": "44-character base58 string"
    }
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Invalid request parameters
- `NOT_FOUND`: Resource not found
- `RATE_LIMITED`: Too many requests
- `INTERNAL_ERROR`: Server error
- `DATABASE_ERROR`: Database operation failed
- `INDEXER_OFFLINE`: Indexer daemon not responding

## 🚀 Deployment

### Railway Deployment

The API includes `railway.toml` configuration:

```toml
[build]
builder = "nixpacks"
buildCommand = "bun install"

[deploy]
startCommand = "bun run start"
restartPolicyType = "always"
numReplicas = 1

[env]
NODE_ENV = "production"
PORT = "3000"
```

### Environment Variables for Production

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
LOG_LEVEL=info
ALLOWED_ORIGINS=https://yourdomain.com
RATE_LIMIT_MAX_REQUESTS=1000
```

### Health Checks

Railway health check endpoint: `GET /health`

### Scaling Considerations

- **Horizontal Scaling**: API server is stateless and can be scaled horizontally
- **Database Connection Pooling**: Use connection pooling for database connections
- **Caching**: Implement Redis caching for frequently accessed data
- **Rate Limiting**: Configure appropriate rate limits for different endpoints

---

**Note**: This API server is currently in active development. Authentication, advanced caching, and WebSocket endpoints are planned for future releases.
