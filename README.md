# Omnipair Indexer

A comprehensive blockchain indexer for the Omnipair protocol on Solana, built with a modern hybrid architecture combining Rust performance with TypeScript flexibility.

## 🏗️ Architecture Overview

This project uses a **hybrid Rust/TypeScript architecture** that leverages the strengths of both languages:

- **Rust Indexer Daemon**: High-performance data ingestion and processing using the Carbon framework
- **TypeScript API Server**: Flexible REST API for client applications using modern web technologies
- **Shared Database Layer**: PostgreSQL with TimescaleDB for optimal time-series data storage

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Solana RPC    │    │   WebSocket     │    │   Client Apps   │
│   & WebSocket   │    │   Real-time     │    │   & Frontends   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │                      │
    ┌─────────────────────────────▼─────────────────────▼──────┐
    │                                                          │
    │  ┌─────────────────────┐    ┌─────────────────────────┐  │
    │  │   Rust Indexer      │    │   TypeScript API        │  │
    │  │   (Carbon-based)    │    │   (Bun + Drizzle)      │  │
    │  │                     │    │                         │  │
    │  │ • Event Processing  │    │ • REST Endpoints       │  │
    │  │ • Account Decoding  │    │ • Query Optimization   │  │
    │  │ • Real-time Sync    │    │ • Response Caching     │  │
    │  │ • Backfilling       │    │ • Rate Limiting        │  │
    │  └─────────────────────┘    └─────────────────────────┘  │
    │                     │                      │             │
    └─────────────────────┼──────────────────────┼─────────────┘
                          │                      │
                          ▼                      ▼
    ┌─────────────────────────────────────────────────────────┐
    │             PostgreSQL + TimescaleDB                    │
    │                                                         │
    │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
    │  │   Pairs     │ │ Positions   │ │  Transactions   │   │
    │  │   Config    │ │ & Health    │ │  (Hypertable)   │   │
    │  └─────────────┘ └─────────────┘ └─────────────────┘   │
    │                                                         │
    │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
    │  │ Aggregates  │ │ Price Feeds │ │   Analytics     │   │
    │  │ (1m, 1h)    │ │ & Charts    │ │   & Metrics     │   │
    │  └─────────────┘ └─────────────┘ └─────────────────┘   │
    └─────────────────────────────────────────────────────────┘
```

## 🚀 Key Features

### Indexer Daemon (Rust)
- **Real-time Transaction Monitoring**: Live processing of Omnipair protocol events
- **Historical Backfilling**: Complete historical data processing with gap detection
- **High Performance**: Built with Rust and the Carbon framework for maximum throughput
- **Account Tracking**: Real-time monitoring of pairs, positions, and protocol state
- **Robust Error Handling**: Automatic retry logic and comprehensive error recovery

### API Server (TypeScript)
- **RESTful API**: Clean, well-documented REST endpoints for all data access
- **Type Safety**: Full TypeScript types with Drizzle ORM integration
- **Performance Optimized**: Efficient database queries with caching strategies
- **Rate Limiting**: Built-in protection against API abuse
- **Health Monitoring**: Comprehensive health checks and system status endpoints

### Database Layer
- **TimescaleDB Integration**: Optimized for time-series queries and analytics
- **Automatic Aggregation**: Continuous aggregates for price feeds and analytics
- **Data Retention**: Intelligent data lifecycle management with compression
- **Migration System**: Version-controlled schema evolution with Drizzle

## 📁 Project Structure

```
omnipair-indexer/
├── indexer/                  # 🦀 Rust indexer daemon
│   ├── src/main.rs          # Main indexer application
│   ├── crates/              # Carbon framework components
│   ├── decoders/            # Omnipair protocol decoders
│   ├── datasources/         # RPC and WebSocket data sources
│   ├── metrics/             # Performance monitoring
│   └── README.md            # Indexer-specific documentation
│
├── api/                     # 📡 TypeScript API server
│   ├── src/                 # API server source code
│   │   ├── routes/          # REST endpoint handlers
│   │   ├── services/        # Business logic layer
│   │   └── middleware/      # Express middleware
│   └── README.md            # API-specific documentation
│
├── database/                # 🗄️ Shared database layer
│   ├── lib/schema.ts        # Database schema definitions
│   ├── migrations/          # Database migration files
│   ├── sql/                 # Custom SQL scripts
│   └── README.md            # Database documentation
│
├── docs/                    # 📚 Additional documentation
├── Cargo.toml               # Rust workspace configuration
├── package.json             # Node.js workspace configuration
└── README.md                # This file
```

## 🚀 Quick Start

### Prerequisites

- **Rust 1.82+**: [Install from rustup.rs](https://rustup.rs/)
- **Bun 1.0+**: [Install from bun.sh](https://bun.sh/)
- **PostgreSQL 14+**: With TimescaleDB extension
- **Git**: For repository management

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd omnipair-indexer

# Install dependencies
bun install  # For TypeScript components
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

Create `.env` files in the appropriate directories:

```bash
# Root .env (shared configuration)
DATABASE_URL=postgresql://username:password@localhost:5432/omnipair_indexer
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

# Indexer-specific (indexer/.env)
RPC_URL=https://api.mainnet-beta.solana.com
RPC_WS_URL=wss://api.mainnet-beta.solana.com
RUST_LOG=info

# API-specific (api/.env)
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

### 4. Start Services

```bash
# Terminal 1: Start the indexer daemon
cd indexer
cargo run --release

# Terminal 2: Start the API server
cd api
bun run dev

# Or use workspace commands from root
cargo run -p omnipair-carbon-indexer  # Indexer
bun run api:dev                       # API Server
```

### 5. Verify Installation

```bash
# Check API health
curl http://localhost:3000/health

# Check indexer logs
tail -f indexer/logs/indexer.log
```

## 🛠️ Development

### Indexer Development (Rust)

```bash
# Build indexer
cargo build -p omnipair-carbon-indexer

# Run with debug logging
RUST_LOG=debug cargo run -p omnipair-carbon-indexer

# Run tests
cargo test

# Watch for changes
cargo install cargo-watch
cargo watch -x "run -p omnipair-carbon-indexer"
```

### API Development (TypeScript)

```bash
# Start development server
cd api
bun run dev

# Run tests
bun test

# Type checking
bun run type-check

# Linting
bun run lint
```

### Database Development

```bash
# Generate new migration
cd database
bun run migrate:create

# Apply migrations
bun run migrate

# Run custom SQL
bun run sql path/to/script.sql
```

## 🚀 Deployment

### Railway Deployment

This project is optimized for Railway deployment with multi-service configuration:

1. **Database Service**: PostgreSQL with TimescaleDB
2. **Indexer Service**: Rust daemon (points to `indexer/`)
3. **API Service**: TypeScript server (points to `api/`)

Each service has its own `railway.toml` configuration file.

### Environment Variables

```bash
# Shared across services
DATABASE_URL=${{Postgres.DATABASE_URL}}
SOLANA_RPC_URL=https://your-premium-rpc.com
SOLANA_WS_URL=wss://your-premium-ws.com

# Indexer-specific
RUST_LOG=info

# API-specific
NODE_ENV=production
PORT=3000
```

### Docker Deployment (Planned)

```bash
# Build all services
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

## 📊 Monitoring and Observability

### Health Checks

- **Indexer Health**: Internal health monitoring with structured logging
- **API Health**: `GET /health` endpoint with database connectivity checks
- **Database Health**: TimescaleDB-specific monitoring queries

### Metrics Collection

- **Indexer Metrics**: Transaction processing rate, RPC call frequency, error rates
- **API Metrics**: Request rate, response times, error rates
- **Database Metrics**: Query performance, storage utilization, compression ratios

### Logging

- **Structured Logging**: JSON-formatted logs across all services
- **Log Levels**: Configurable log levels for development and production
- **Log Aggregation**: Ready for centralized logging systems

## 🔧 Configuration

### Indexer Configuration

```bash
# Environment variables
RPC_URL=https://api.mainnet-beta.solana.com
RPC_WS_URL=wss://api.mainnet-beta.solana.com
DATABASE_URL=postgresql://user:pass@host/db
RUST_LOG=info
```

### API Configuration

```bash
# Server settings
PORT=3000
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@host/db

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
ALLOWED_ORIGINS=https://yourdomain.com
```

## 📚 Documentation

- **[Indexer Documentation](indexer/README.md)**: Rust daemon architecture and development
- **[API Documentation](api/README.md)**: TypeScript API server and endpoints
- **[Database Documentation](database/README.md)**: Schema, migrations, and TimescaleDB setup
- **[Quick Start Guide](QUICKSTART.md)**: Get up and running in 5 minutes
- **[Setup Guide](SETUP.md)**: Detailed installation and configuration
- **[Development Guide](DEVELOPMENT.md)**: Development practices and architecture details

## 🔍 API Reference

### Core Endpoints

- `GET /health` - System health check
- `GET /pairs` - List all trading pairs
- `GET /pairs/:address` - Get pair details
- `GET /users/:address/positions` - Get user positions
- `GET /transactions` - Query transaction history
- `GET /analytics/overview` - Protocol analytics

### Planned Features

- **WebSocket API**: Real-time data streaming
- **GraphQL API**: Flexible query interface
- **Authentication**: API key and JWT-based auth
- **Advanced Analytics**: Custom metrics and reporting
- **Alerting System**: Real-time notifications

## 🚨 Troubleshooting

### Common Issues

#### Database Connection
```bash
# Test database connectivity
psql $DATABASE_URL -c "SELECT version();"

# Check TimescaleDB extension
psql $DATABASE_URL -c "SELECT * FROM pg_extension WHERE extname = 'timescaledb';"
```

#### RPC Connectivity
```bash
# Test Solana RPC
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  $SOLANA_RPC_URL
```

#### Service Health
```bash
# Check indexer logs
tail -f indexer/logs/indexer.log

# Check API health
curl http://localhost:3000/health
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Update documentation
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Development Guidelines

- **Rust Code**: Follow Rust best practices, use `cargo fmt` and `cargo clippy`
- **TypeScript Code**: Use strict TypeScript, follow ESLint rules
- **Database Changes**: Always create migrations for schema changes
- **Documentation**: Update relevant documentation for any changes
- **Testing**: Add tests for new features and bug fixes

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:

- **Issues**: Create an issue in the GitHub repository
- **Documentation**: Check the component-specific README files
- **Logs**: Review application logs for error details
- **Community**: Join our Discord/Telegram for community support

---

**Note**: This indexer is specifically designed for the Omnipair protocol on Solana. Ensure you're using the correct program ID and connecting to the appropriate Solana network.