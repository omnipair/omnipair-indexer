# Omnipair Indexer Quick Start Guide

Get the Omnipair indexer up and running in 5 minutes with the new hybrid Rust/TypeScript architecture!

## 🚀 What You're Building

A high-performance blockchain indexer with two main components:
- **Rust Indexer Daemon**: Monitors Solana and processes Omnipair protocol events
- **TypeScript API Server**: Provides REST endpoints for querying indexed data

## 📋 Prerequisites

Make sure you have these installed:
- **Rust 1.82+**: [Install from rustup.rs](https://rustup.rs/)
- **Bun 1.0+**: [Install from bun.sh](https://bun.sh/)
- **PostgreSQL 14+**: [Download here](https://www.postgresql.org/download/)
- **Git**: For cloning the repository

## ⚡ Quick Setup (5 Minutes)

### 1. Clone and Install
```bash
# Clone the repository
git clone <repository-url>
cd omnipair-indexer

# Install TypeScript dependencies
bun install
```

### 2. Database Setup
```bash
# Create database
createdb omnipair_indexer

# Enable TimescaleDB extension
psql omnipair_indexer -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Run database migrations
cd database
bun run migrate
psql omnipair_indexer -f sql/setup-timescaledb.sql
cd ..
```

### 3. Environment Configuration
```bash
# Create environment file
cp env.template .env

# Edit .env with your database credentials
# Minimum required:
DATABASE_URL=postgresql://username:password@localhost:5432/omnipair_indexer
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com
```

### 4. Start Services

**Option A: Start Both Services (Recommended)**
```bash
# Terminal 1: Start the indexer daemon
cd indexer
cargo run --release

# Terminal 2: Start the API server
cd api
bun run dev
```

**Option B: Start Individual Services**
```bash
# Just the indexer (for data collection only)
cargo run -p omnipair-carbon-indexer

# Just the API (if you have existing data)
cd api && bun run dev
```

### 5. Verify Everything Works
```bash
# Check API health
curl http://localhost:3000/health

# Check if indexer is processing data
curl http://localhost:3000/status
```

## 🎯 What Happens Next

### Indexer Daemon (Rust)
1. **Connects to Solana**: Establishes RPC and WebSocket connections
2. **Account Backfill**: Fetches all existing Omnipair accounts (pairs, positions)
3. **Real-time Monitoring**: Starts monitoring for new transactions and account changes
4. **Data Processing**: Decodes and processes Omnipair protocol events
5. **Database Updates**: Writes processed data to PostgreSQL/TimescaleDB

### API Server (TypeScript)
1. **Database Connection**: Connects to the shared PostgreSQL database
2. **REST Endpoints**: Serves API endpoints for querying indexed data
3. **Health Monitoring**: Provides health checks and system status
4. **Query Optimization**: Efficiently serves data with caching and pagination

## 📊 Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐
│   Solana RPC    │    │   Client Apps   │
│   & WebSocket   │    │   & Frontends   │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│ Rust Indexer    │    │ TypeScript API  │
│ (Port: N/A)     │    │ (Port: 3000)    │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          └──────────┬───────────┘
                     ▼
          ┌─────────────────────┐
          │ PostgreSQL +        │
          │ TimescaleDB         │
          │ (Port: 5432)        │
          └─────────────────────┘
```

## 🔧 Development Commands

### Indexer (Rust)
```bash
# Build indexer
cargo build -p omnipair-carbon-indexer

# Run with debug logging
RUST_LOG=debug cargo run -p omnipair-carbon-indexer

# Run tests
cargo test

# Format code
cargo fmt

# Lint code
cargo clippy
```

### API Server (TypeScript)
```bash
# Development mode (auto-restart)
cd api && bun run dev

# Production mode
cd api && bun run start

# Run tests
cd api && bun test

# Type checking
cd api && bun run type-check
```

### Database
```bash
# Create new migration
cd database && bun run migrate:create

# Apply migrations
cd database && bun run migrate

# Run custom SQL
cd database && bun run sql path/to/script.sql
```

## 📡 API Endpoints

Once running, you can access these endpoints:

### Health & Status
- `GET http://localhost:3000/health` - Basic health check
- `GET http://localhost:3000/status` - Detailed system status

### Data Endpoints (Planned)
- `GET http://localhost:3000/pairs` - List all trading pairs
- `GET http://localhost:3000/pairs/:address` - Get pair details
- `GET http://localhost:3000/users/:address/positions` - Get user positions
- `GET http://localhost:3000/transactions` - Query transactions

## 🚨 Troubleshooting

### Database Issues
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql
# or on macOS: brew services list | grep postgres

# Test database connection
psql $DATABASE_URL -c "SELECT version();"

# Check TimescaleDB extension
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'timescaledb';"
```

### RPC Issues
```bash
# Test Solana RPC endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://api.mainnet-beta.solana.com
```

### Build Issues
```bash
# Clean Rust build cache
cargo clean

# Update Rust
rustup update

# Clean TypeScript cache
cd api && rm -rf node_modules && bun install
```

### Common Error Messages

**"Failed to connect to database"**
- Check your `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Verify database exists: `psql -l | grep omnipair`

**"RPC connection failed"**
- Check your internet connection
- Try a different RPC endpoint
- Verify `SOLANA_RPC_URL` in environment

**"Permission denied"**
- Check database user permissions
- Ensure TimescaleDB extension is installed
- Run migrations: `cd database && bun run migrate`

## 🎯 Next Steps

### For Development
1. **Explore the Code**: Check out the component-specific README files
2. **Add Features**: Follow the development guides in each component
3. **Run Tests**: Ensure everything works with `cargo test` and `bun test`

### For Production
1. **Configure RPC**: Use premium RPC endpoints for better performance
2. **Set up Monitoring**: Implement logging and metrics collection
3. **Deploy**: Use Railway, Docker, or your preferred deployment method

### For Integration
1. **API Integration**: Start building your frontend using the REST API
2. **Data Analysis**: Query the database directly for custom analytics
3. **Extend Functionality**: Add custom processors or endpoints

## 📚 Learn More

- **[Main README](README.md)**: Complete project overview and architecture
- **[Indexer Documentation](indexer/README.md)**: Rust daemon details
- **[API Documentation](api/README.md)**: TypeScript API server details
- **[Database Documentation](database/README.md)**: Schema and TimescaleDB setup
- **[Development Guide](DEVELOPMENT.md)**: Advanced development practices

## 🆘 Need Help?

- **Check Logs**: Both services provide detailed logging
- **Review Documentation**: Component-specific README files have detailed troubleshooting
- **Create Issues**: Report bugs or request features in the GitHub repository
- **Community**: Join our Discord/Telegram for community support

---

**🎉 Congratulations!** Your Omnipair indexer is now running and processing blockchain data with a modern, scalable architecture!