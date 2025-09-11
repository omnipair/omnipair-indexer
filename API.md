# Omnipair Indexer API Documentation

This document provides comprehensive API documentation for the Omnipair indexer, including endpoints, data structures, and usage examples.

## 🌐 Base URL

```
http://localhost:3000
```

## 📊 Health & Status Endpoints

### GET /health
Returns the current health status of the indexer.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Status Codes:**
- `200 OK`: Indexer is healthy
- `503 Service Unavailable`: Indexer is unhealthy

### GET /
Returns a detailed HTML status page with comprehensive system information.

**Response:** HTML page with:
- System uptime
- Processing statistics
- Error logs
- Performance metrics

## 🔄 Management Endpoints

### POST /backfill
Triggers a manual backfill operation.

**Request Body:**
```json
{
  "fromSlot": 250000000,
  "toSlot": 260000000,
  "reprocess": false,
  "batchSize": 1000
}
```

**Response:**
```json
{
  "message": "Backfilling 1500 transactions complete - took 45.2 seconds",
  "error": null
}
```

**Status Codes:**
- `200 OK`: Backfill completed successfully
- `500 Internal Server Error`: Backfill failed

**Example:**
```bash
curl -X POST http://localhost:3000/backfill \
  -H "Content-Type: application/json" \
  -d '{"fromSlot": 250000000, "batchSize": 500}'
```

### POST /gap-fill
Triggers a manual gap fill operation to catch missed transactions.

**Response:**
```json
{
  "message": "Gap fill complete - processed 25 transactions in 12.3 seconds",
  "error": null
}
```

**Status Codes:**
- `200 OK`: Gap fill completed successfully
- `500 Internal Server Error`: Gap fill failed

**Example:**
```bash
curl -X POST http://localhost:3000/gap-fill
```

## 📈 Data Query Endpoints

### GET /pairs
Returns all Omnipair pairs.

**Query Parameters:**
- `limit` (optional): Number of results to return (default: 100)
- `offset` (optional): Number of results to skip (default: 0)

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
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

### GET /pairs/:pairAddress
Returns detailed information about a specific pair.

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
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### GET /pairs/:pairAddress/transactions
Returns transactions for a specific pair.

**Query Parameters:**
- `type` (optional): Filter by transaction type (`swap`, `borrow`, `repay`, etc.)
- `limit` (optional): Number of results (default: 100)
- `offset` (optional): Number to skip (default: 0)
- `from` (optional): Start timestamp (ISO 8601)
- `to` (optional): End timestamp (ISO 8601)

**Response:**
```json
{
  "transactions": [
    {
      "txSignature": "TX123...",
      "blockTime": "2024-01-01T00:00:00.000Z",
      "slot": 250000000,
      "userAddress": "USER123...",
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
  "total": 1,
  "limit": 100,
  "offset": 0
}
```

### GET /pairs/:pairAddress/price-feeds
Returns price feed data for a specific pair.

**Query Parameters:**
- `from` (optional): Start timestamp (ISO 8601)
- `to` (optional): End timestamp (ISO 8601)
- `interval` (optional): Aggregation interval (`1m`, `5m`, `1h`, `1d`)

**Response:**
```json
{
  "priceFeeds": [
    {
      "time": "2024-01-01T00:00:00.000Z",
      "price0": "2.0",
      "price1": "0.5",
      "volume24h": "1000000.0",
      "txCount24h": 150,
      "source": "spot_swap"
    }
  ]
}
```

### GET /users/:userAddress/positions
Returns user positions.

**Query Parameters:**
- `pairAddress` (optional): Filter by specific pair
- `includeHistory` (optional): Include position history (boolean)

**Response:**
```json
{
  "positions": [
    {
      "positionAddress": "POS123...",
      "userAddress": "USER123...",
      "pairAddress": "ABC123...",
      "collateral0Amount": "1000000",
      "collateral1Amount": "2000000",
      "debt0Shares": "500000",
      "debt1Shares": "0",
      "collateralValue": "1500.0",
      "debtValue": "500.0",
      "healthFactor": "3.0",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /analytics/pairs/:pairAddress
Returns analytics data for a specific pair.

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
      "change24h": "5.2"
    },
    "tvl": {
      "current": "5000000.0",
      "change24h": "2.1"
    },
    "fees": {
      "total": "3000.0",
      "change24h": "8.5"
    },
    "apy": {
      "current": "12.5",
      "average": "10.8"
    }
  }
}
```

## 📊 Data Structures

### Transaction Types
```typescript
enum TransactionType {
  SWAP = "swap",
  BORROW = "borrow",
  REPAY = "repay",
  ADD_COLLATERAL = "add_collateral",
  REMOVE_COLLATERAL = "remove_collateral",
  ADD_LIQUIDITY = "add_liquidity",
  REMOVE_LIQUIDITY = "remove_liquidity",
  LIQUIDATE = "liquidate"
}
```

### Event Types
```typescript
interface SwapEvent {
  type: "SwapEvent";
  user: string;
  amount0_in: string;
  amount1_in: string;
  amount0_out: string;
  amount1_out: string;
  timestamp: number;
}

interface AdjustCollateralEvent {
  type: "AdjustCollateralEvent";
  user: string;
  amount0: string;
  amount1: string;
  timestamp: number;
}

interface UserPositionUpdatedEvent {
  type: "UserPositionUpdatedEvent";
  user: string;
  pair: string;
  position: string;
  collateral0: string;
  collateral1: string;
  debt0_shares: string;
  debt1_shares: string;
  timestamp: number;
}
```

## 🔍 Query Examples

### Get Recent Swaps for a Pair
```bash
curl "http://localhost:3000/pairs/ABC123.../transactions?type=swap&limit=10"
```

### Get Price History
```bash
curl "http://localhost:3000/pairs/ABC123.../price-feeds?from=2024-01-01T00:00:00Z&to=2024-01-02T00:00:00Z&interval=1h"
```

### Get User Positions
```bash
curl "http://localhost:3000/users/USER123.../positions"
```

### Get Analytics Data
```bash
curl "http://localhost:3000/analytics/pairs/ABC123...?period=7d&metrics=volume,tvl,apy"
```

## 📈 WebSocket Endpoints

### WS /ws/transactions
Real-time transaction feed.

**Message Format:**
```json
{
  "type": "transaction",
  "data": {
    "txSignature": "TX123...",
    "pairAddress": "ABC123...",
    "userAddress": "USER123...",
    "transactionType": "swap",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

### WS /ws/price-feeds
Real-time price feed updates.

**Message Format:**
```json
{
  "type": "price_update",
  "data": {
    "pairAddress": "ABC123...",
    "price0": "2.0",
    "price1": "0.5",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## 🚨 Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid parameter value",
    "details": {
      "field": "fromSlot",
      "value": "invalid",
      "expected": "number"
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
- `RPC_ERROR`: Solana RPC error

## 🔐 Authentication (Future)

Currently, the API is open. Future versions may include:
- API key authentication
- Rate limiting per user
- Admin endpoints with enhanced permissions

## 📊 Rate Limits

- **Health endpoints**: No limits
- **Data endpoints**: 100 requests/minute
- **Management endpoints**: 10 requests/minute
- **WebSocket connections**: 5 concurrent connections

## 🧪 Testing

### Health Check
```bash
curl http://localhost:3000/health
```

### Backfill Test
```bash
curl -X POST http://localhost:3000/backfill \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 10}'
```

### Data Query Test
```bash
curl "http://localhost:3000/pairs?limit=5"
```

## 📝 Changelog

### v1.0.0
- Initial API release
- Basic health and management endpoints
- Data query endpoints
- WebSocket support for real-time updates

---

**Note**: This API documentation is for the current version. Check the repository for the latest updates and changes.

