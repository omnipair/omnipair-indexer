# Omnipair Indexer

A comprehensive blockchain indexer for the Omnipair protocol on Solana, designed to track swaps, lending positions, liquidity provision, and all related transaction data with time-series optimization.

## 🚀 Features

- **Real-time Transaction Indexing**: Live monitoring of Omnipair program transactions
- **Historical Backfilling**: Complete historical data processing from any point in time
- **User Position Tracking**: Real-time monitoring of collateral, debt, and health factors
- **Price Feed Construction**: Built from spot swap transactions with time-series optimization
- **LP Analytics**: Historical APY calculations, volume analysis, and TVL tracking
- **TimescaleDB Integration**: Optimized for time-series queries and analytics
- **Gap Detection**: Automatic detection and processing of missed transactions
- **Rate Limiting**: Built-in protection against RPC limits
- **Health Monitoring**: Comprehensive health checks and status endpoints

## 📋 Prerequisites

### Required Software
- **Node.js**: v18+ (recommended: v20+)
- **Bun**: v1.0+ (JavaScript runtime)
- **PostgreSQL**: v14+ with TimescaleDB extension
- **Git**: For cloning the repository

### Required Environment Variables
Create a `.env` file in the root directory:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/omnipair_indexer

# Solana RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

# Optional: Custom RPC endpoints for better performance
# SOLANA_RPC_URL=https://your-custom-rpc-endpoint.com
# SOLANA_WS_URL=wss://your-custom-ws-endpoint.com

# Logging Configuration
LOG_LEVEL=info
NODE_ENV=production

# Server Configuration
PORT=3000

# Optional: Telegram webhook for alerts
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd omnipair-indexer
```

### 2. Install Dependencies
```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Install project dependencies
bun install
```

### 3. Database Setup

#### Install PostgreSQL with TimescaleDB
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo apt install timescaledb-2-postgresql-14

# macOS (using Homebrew)
brew install postgresql
brew install timescaledb

# Windows
# Download and install from official websites:
# - PostgreSQL: https://www.postgresql.org/download/windows/
# - TimescaleDB: https://docs.timescale.com/install/latest/installation-windows/
```

#### Create Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE omnipair_indexer;

# Connect to the database
\c omnipair_indexer;

# Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

# Exit psql
\q
```

#### Run Database Migrations
```bash
# Navigate to database package
cd packages/database

# IMPORTANT: Create .env file in packages/database/ directory
# The database package looks for .env in its own directory, not the project root
cp ../../.env .env  # Copy from root, or create directly here

# Run migrations
bun run migrate

# Setup TimescaleDB hypertables
psql -U postgres -d omnipair_indexer -f sql/setup-timescaledb.sql
```

### 4. Verify Installation
```bash
# Run a quick test
bun run start --skip-backfill

# Check health endpoint
curl http://localhost:3000/health
```

## 🚀 Usage

### Basic Usage

#### Start with Full Backfill (Recommended for First Run)
```bash
# This will backfill all historical data, then start real-time monitoring
bun run start
```

#### Start from Current Block Only
```bash
# Skip historical backfill, start monitoring from current block
bun run start --skip-backfill
```

#### Start from Specific Slot
```bash
# Backfill from a specific slot number
bun run start --backfill-from-slot 250000000
```

### Development Mode
```bash
# Start with file watching for development
bun run dev
```

### Production Deployment
```bash
# Build and start in production mode
bun run start
```

## 📊 API Endpoints

### Health Check
```bash
# Basic health check
GET http://localhost:3000/health

# Response:
{
  "status": "healthy",
  "uptime": 3600,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Manual Operations
```bash
# Trigger manual backfill
POST http://localhost:3000/backfill

# Trigger manual gap fill
POST http://localhost:3000/gap-fill
```

## 🔄 Backfilling System

### Automatic Backfilling
- **Initial backfill**: Runs automatically on startup (unless `--skip-backfill` is used)
- **Gap filling**: Runs every 5 minutes to catch any missed transactions
- **Resume capability**: Automatically resumes from the last processed transaction

### Manual Backfilling Options

#### Command Line Options
```bash
# Skip initial backfill
bun run start --skip-backfill

# Backfill from specific slot
bun run start --backfill-from-slot 250000000

# Backfill specific range (programmatic)
# Use the API endpoints or modify the code
```

#### HTTP API
```bash
# Manual backfill
curl -X POST http://localhost:3000/backfill

# Manual gap fill
curl -X POST http://localhost:3000/gap-fill
```

### Backfill Configuration
The backfilling system supports various options:

```typescript
interface BackfillOptions {
  fromSlot?: number;      // Start from specific slot
  toSlot?: number;        // End at specific slot
  reprocess?: boolean;    // Reprocess already indexed transactions
  batchSize?: number;     // Number of transactions per batch (default: 1000)
}
```

## 📈 Database Schema

### Core Tables

#### Pairs
Stores Omnipair pair information:
```sql
CREATE TABLE pairs (
    pair_address VARCHAR(44) PRIMARY KEY,
    token0_address VARCHAR(44) NOT NULL,
    token1_address VARCHAR(44) NOT NULL,
    token0_decimals SMALLINT NOT NULL,
    token1_decimals SMALLINT NOT NULL,
    -- ... other fields
);
```

#### User Positions
Current user positions with collateral/debt tracking:
```sql
CREATE TABLE user_positions (
    position_address VARCHAR(44) PRIMARY KEY,
    user_address VARCHAR(44) NOT NULL,
    pair_address VARCHAR(44) REFERENCES pairs(pair_address),
    collateral0_amount BIGINT NOT NULL DEFAULT 0,
    collateral1_amount BIGINT NOT NULL DEFAULT 0,
    debt0_shares BIGINT NOT NULL DEFAULT 0,
    debt1_shares BIGINT NOT NULL DEFAULT 0,
    -- ... other fields
);
```

#### Transaction Details (TimescaleDB Hypertable)
Detailed transaction data optimized for time-series queries:
```sql
CREATE TABLE transaction_details (
    time TIMESTAMPTZ NOT NULL,
    tx_signature VARCHAR(88) NOT NULL,
    pair_address VARCHAR(44) NOT NULL,
    user_address VARCHAR(44) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    -- ... amount fields, calculated fields, metadata
);
```

### TimescaleDB Features

#### Hypertables
- `transaction_details`: All transaction data
- `price_feeds`: Price data from swaps
- `market_state`: Market state snapshots

#### Continuous Aggregates
- `price_feeds_1m`: 1-minute price aggregations
- `transaction_details_1h`: 1-hour transaction aggregations
- `market_state_1h`: 1-hour market state aggregations

#### Retention Policies
- Raw data: 30 days
- Aggregated data: 1 year

## 🔍 Monitoring & Observability

### Logging
The indexer uses structured logging with Pino:

```bash
# Set log level
export LOG_LEVEL=debug

# View logs
tail -f logs/indexer.log
```

### Health Monitoring
```bash
# Check indexer status
curl http://localhost:3000/health

# View detailed status page
open http://localhost:3000/
```

### Performance Monitoring
- **Transaction Processing Rate**: Monitor transactions per second
- **Database Performance**: Query execution times
- **RPC Usage**: Monitor RPC call frequency and errors
- **Memory Usage**: Track memory consumption over time

## 🛠️ Development

### Project Structure
```
src/
├── omnipair_indexer/
│   ├── backfill/           # Backfilling system
│   ├── events/             # Event definitions
│   ├── processors/         # Transaction processors
│   └── analytics/          # Analytics utilities
├── logger/                 # Logging configuration
└── connection.ts           # Solana connection setup

packages/
└── database/
    ├── lib/
    │   └── schema.ts       # Database schema
    └── sql/
        └── setup-timescaledb.sql
```

### Adding New Event Types
1. Define the event in `src/omnipair_indexer/events/index.ts`
2. Add parsing logic in `src/omnipair_indexer/processors/logParser.ts`
3. Update transaction processor in `src/omnipair_indexer/processors/transactionProcessor.ts`
4. Add database schema if needed

### Testing
```bash
# Run tests (when implemented)
bun test

# Run with coverage
bun test --coverage
```

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check TimescaleDB extension
psql -U postgres -d omnipair_indexer -c "SELECT * FROM pg_extension WHERE extname = 'timescaledb';"
```

#### RPC Rate Limiting
```bash
# Check RPC endpoint status
curl -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' $SOLANA_RPC_URL

# Use custom RPC endpoints for better performance
```

#### Memory Issues
```bash
# Monitor memory usage
ps aux | grep bun

# Adjust batch sizes in backfill options
```

### Performance Optimization

#### Database Optimization
```sql
-- Check query performance
EXPLAIN ANALYZE SELECT * FROM transaction_details WHERE pair_address = '...';

-- Monitor TimescaleDB performance
SELECT * FROM timescaledb_information.hypertables;
```

#### RPC Optimization
- Use dedicated RPC endpoints
- Implement connection pooling
- Monitor RPC response times

## 📚 API Reference

### Transaction Types
- `swap`: Token swaps
- `borrow`: Borrowing tokens
- `repay`: Repaying borrowed tokens
- `add_collateral`: Adding collateral
- `remove_collateral`: Removing collateral
- `add_liquidity`: Adding liquidity
- `remove_liquidity`: Removing liquidity
- `liquidate`: Position liquidations

### Event Types
- `SwapEvent`: Swap transactions
- `AdjustCollateralEvent`: Collateral adjustments
- `AdjustDebtEvent`: Debt adjustments
- `UserPositionCreatedEvent`: New user positions
- `UserPositionUpdatedEvent`: Position updates
- `UserPositionLiquidatedEvent`: Liquidations
- And more...

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

[Add your license information here]

## 📚 Documentation

- **[Quick Start Guide](QUICKSTART.md)**: Get up and running in 5 minutes
- **[Setup Guide](SETUP.md)**: Detailed installation and configuration
- **[API Documentation](API.md)**: Complete API reference and examples
- **[Development Guide](DEVELOPMENT.md)**: Developer documentation and architecture
- **[Environment Template](env.template)**: Configuration template

## 🚀 Quick Start

```bash
# Clone and install
git clone <repository-url>
cd omnipair-indexer
bun install

# Setup database
createdb omnipair_indexer
psql omnipair_indexer -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Configure environment
cp env.template .env
# Edit .env with your database credentials

# Start indexer
bun run start
```

For detailed setup instructions, see the [Quick Start Guide](QUICKSTART.md).

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the logs for error details

---

**Note**: This indexer is designed specifically for the Omnipair protocol. Make sure you're using the correct program ID and that the protocol is deployed on the network you're connecting to.