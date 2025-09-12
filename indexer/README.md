# Omnipair Indexer (Rust Daemon)

A high-performance Rust daemon built with the Carbon framework that monitors Omnipair protocol events on Solana and feeds data to PostgreSQL/TimescaleDB.

## 🏗️ Architecture

The indexer is built using the **Carbon Framework** - a modular blockchain indexing framework that provides:

- **Pipeline-based Architecture**: Composable data processing pipeline
- **Multiple Datasources**: RPC polling, WebSocket subscriptions, account backfilling
- **Event Processing**: Automatic decoding of Omnipair protocol events
- **Metrics Collection**: Built-in performance monitoring
- **Error Handling**: Robust error recovery and logging

### Data Flow

```
Solana RPC/WS → Carbon Pipeline → Event Processors → Database Writers → PostgreSQL
```

## 📁 Project Structure

```
indexer/
├── Cargo.toml                 # Package configuration
├── railway.toml               # Railway deployment config
├── src/
│   └── main.rs               # Main indexer daemon
├── crates/                   # Carbon framework crates
│   ├── core/                 # Core pipeline functionality
│   ├── macros/               # Helper macros
│   ├── proc-macros/          # Procedural macros
│   └── test-utils/           # Testing utilities
├── datasources/              # Data source implementations
│   └── rpc-program-subscribe-datasource/
├── decoders/                 # Protocol decoders
│   └── omnipair_decoder/     # Omnipair protocol decoder
└── metrics/                  # Metrics implementations
    ├── log-metrics/          # Structured logging metrics
    └── prometheus-metrics/   # Prometheus metrics (planned)
```

## 🚀 Getting Started

### Prerequisites

- **Rust 1.82+**: Install from [rustup.rs](https://rustup.rs/)
- **PostgreSQL 14+**: With TimescaleDB extension
- **Solana RPC Access**: Mainnet or testnet RPC endpoint

### Environment Variables

Create a `.env` file in the indexer directory:

```bash
# Solana RPC Configuration
RPC_URL=https://api.mainnet-beta.solana.com
RPC_WS_URL=wss://api.mainnet-beta.solana.com

# Database Configuration (for future database integration)
DATABASE_URL=postgresql://username:password@localhost:5432/omnipair_indexer

# Logging Configuration
RUST_LOG=info
```

### Build and Run

```bash
# From the indexer directory
cd indexer

# Build the indexer
cargo build --release

# Run the indexer
cargo run --release

# Or run directly from workspace root
cargo run -p omnipair-carbon-indexer
```

### Development Mode

```bash
# Run with debug logging
RUST_LOG=debug cargo run

# Run with specific module logging
RUST_LOG=carbon_core=debug,omnipair_carbon_indexer=info cargo run

# Watch for changes (install cargo-watch first)
cargo install cargo-watch
cargo watch -x run
```

## 🔧 Configuration

### Current Implementation

The indexer currently implements:

1. **GPA Backfill Datasource**: Fetches all existing program accounts on startup
2. **RPC Program Subscribe**: Real-time monitoring of account changes via WebSocket
3. **Account Processing**: Decodes and logs Omnipair accounts (Pairs, UserPositions)
4. **Structured Logging**: JSON-formatted logs with configurable levels

### Planned Features

- **Database Integration**: Direct writes to PostgreSQL/TimescaleDB
- **Instruction Processing**: Decode and process transaction instructions
- **Backfill Management**: Historical transaction processing with gap detection
- **Health Endpoints**: HTTP server for health checks and metrics
- **Rate Limiting**: Built-in RPC rate limiting and retry logic

## 📊 Event Types

The indexer processes these Omnipair protocol events:

### Account Types
- **Pair**: Trading pair configuration and state
- **UserPosition**: User collateral and debt positions
- **RateModel**: Interest rate model parameters
- **FutarchyAuthority**: Protocol governance authority
- **PairConfig**: Pair-specific configuration

### Instruction Types (Planned)
- **SwapEvent**: Token swap transactions
- **AdjustCollateralEvent**: Collateral adjustments
- **AdjustDebtEvent**: Debt position changes
- **UserPositionCreatedEvent**: New position creation
- **UserPositionUpdatedEvent**: Position updates
- **UserPositionLiquidatedEvent**: Liquidation events
- **PairCreatedEvent**: New trading pair creation

## 🔍 Monitoring and Debugging

### Logging

The indexer uses structured logging with multiple levels:

```bash
# Set log level
export RUST_LOG=debug

# Module-specific logging
export RUST_LOG=carbon_core=info,omnipair_carbon_indexer=debug

# View logs in real-time
cargo run 2>&1 | jq '.'
```

### Log Output Format

```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "level": "INFO",
  "target": "omnipair_carbon_indexer",
  "message": "Pair: Pair { ... }",
  "fields": {
    "pair_address": "ABC123...",
    "token0": "TOK0...",
    "token1": "TOK1..."
  }
}
```

### Performance Monitoring

Current metrics (logged):
- Account processing rate
- RPC call frequency
- Error rates and types
- Pipeline processing latency

Planned metrics (Prometheus):
- Transactions per second
- Database write latency
- Memory usage
- RPC endpoint health

## 🛠️ Development

### Adding New Event Processors

1. **Create Processor Struct**:
```rust
pub struct MyEventProcessor;

#[async_trait]
impl Processor for MyEventProcessor {
    type InputType = AccountProcessorInputType<OmnipairAccount>;
    
    async fn process(&mut self, update: Self::InputType, metrics: Arc<MetricsCollection>) -> CarbonResult<()> {
        // Process the event
        Ok(())
    }
}
```

2. **Register in Pipeline**:
```rust
Pipeline::builder()
    .account(OmnipairDecoder, MyEventProcessor)
    .build()?
    .run()
    .await?;
```

### Adding New Datasources

1. **Implement Datasource Trait**:
```rust
#[async_trait]
impl Datasource for MyDatasource {
    async fn consume(&self, id: DatasourceId, sender: Sender<(Update, DatasourceId)>, cancellation_token: CancellationToken, metrics: Arc<MetricsCollection>) -> CarbonResult<()> {
        // Fetch and send data
        Ok(())
    }
    
    fn update_types(&self) -> Vec<UpdateType> {
        vec![UpdateType::AccountUpdate]
    }
}
```

2. **Add to Pipeline**:
```rust
Pipeline::builder()
    .datasource(MyDatasource::new())
    .build()?
    .run()
    .await?;
```

### Testing

```bash
# Run tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific test
cargo test test_account_processing

# Test with debug logging
RUST_LOG=debug cargo test
```

## 🚨 Troubleshooting

### Common Issues

#### RPC Connection Errors
```bash
# Test RPC endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  $RPC_URL
```

#### WebSocket Connection Issues
```bash
# Check WebSocket endpoint
wscat -c $RPC_WS_URL
```

#### Build Errors
```bash
# Clean build cache
cargo clean

# Update dependencies
cargo update

# Check Rust version
rustc --version
```

### Performance Issues

#### High Memory Usage
- Adjust batch sizes in datasources
- Enable compression for large account data
- Monitor pipeline backpressure

#### Slow Processing
- Check RPC endpoint latency
- Verify database connection performance
- Monitor pipeline metrics

## 🚀 Deployment

### Local Development
```bash
# Run with environment file
cargo run --release
```

### Railway Deployment
The indexer includes `railway.toml` configuration:

```toml
[build]
builder = "nixpacks"
buildCommand = "cargo build --release"

[deploy]
startCommand = "./target/release/omnipair-carbon-indexer"
restartPolicyType = "always"
numReplicas = 1
```

### Docker Deployment (Planned)
```dockerfile
FROM rust:1.82-slim as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/omnipair-carbon-indexer /usr/local/bin/
CMD ["omnipair-carbon-indexer"]
```

### Environment Variables for Production
```bash
RPC_URL=https://your-premium-rpc-endpoint.com
RPC_WS_URL=wss://your-premium-ws-endpoint.com
DATABASE_URL=postgresql://user:pass@host:5432/omnipair_indexer
RUST_LOG=info
```

## 📚 References

- **Carbon Framework**: Internal documentation in `crates/core/`
- **Solana RPC API**: [Solana JSON RPC API](https://docs.solana.com/api/http)
- **Omnipair Protocol**: Protocol-specific documentation
- **TimescaleDB**: [TimescaleDB Documentation](https://docs.timescale.com/)

---

**Note**: This indexer is currently in active development. Database integration, instruction processing, and advanced features are planned for future releases.