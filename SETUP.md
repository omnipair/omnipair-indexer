# Omnipair Indexer Setup Guide

This guide will walk you through setting up the Omnipair indexer from scratch, including all required dependencies and configurations.

## 🎯 Overview

The Omnipair indexer is a comprehensive blockchain data indexing system that:
- Monitors Omnipair protocol transactions in real-time
- Processes historical data through backfilling
- Stores data in PostgreSQL with TimescaleDB for time-series optimization
- Provides analytics and monitoring capabilities

## 📋 System Requirements

### Minimum Requirements
- **CPU**: 2+ cores
- **RAM**: 4GB+ (8GB+ recommended for production)
- **Storage**: 50GB+ SSD (more for historical data)
- **Network**: Stable internet connection

### Recommended Requirements
- **CPU**: 4+ cores
- **RAM**: 16GB+
- **Storage**: 200GB+ NVMe SSD
- **Network**: High-speed connection with low latency

## 🛠️ Step-by-Step Setup

### Step 1: Install System Dependencies

#### Ubuntu/Debian
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl git build-essential

# Install Node.js (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install TimescaleDB
sudo apt install -y timescaledb-2-postgresql-14

# Configure TimescaleDB
sudo timescaledb-tune --quiet --yes
```

#### macOS
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install node postgresql timescaledb

# Start PostgreSQL
brew services start postgresql
```

#### Windows
1. **Install Node.js**: Download from [nodejs.org](https://nodejs.org/)
2. **Install Bun**: Run `powershell -c "irm bun.sh/install.ps1 | iex"`
3. **Install PostgreSQL**: Download from [postgresql.org](https://www.postgresql.org/download/windows/)
4. **Install TimescaleDB**: Download from [TimescaleDB docs](https://docs.timescale.com/install/latest/installation-windows/)

### Step 2: Database Setup

#### Create PostgreSQL User and Database
```bash
# Switch to postgres user
sudo -u postgres psql

# Create user (replace with your desired username/password)
CREATE USER omnipair_user WITH PASSWORD 'your_secure_password';

# Create database
CREATE DATABASE omnipair_indexer OWNER omnipair_user;

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE omnipair_indexer TO omnipair_user;

# Exit psql
\q
```

#### Enable TimescaleDB Extension
```bash
# Connect to the database
psql -U omnipair_user -d omnipair_indexer

# Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

# Verify installation
SELECT * FROM pg_extension WHERE extname = 'timescaledb';

# Exit psql
\q
```

### Step 3: Clone and Setup Project

```bash
# Clone the repository
git clone <repository-url>
cd omnipair-indexer

# Install dependencies
bun install

# Copy environment template
cp .env.example .env
```

### Step 4: Configure Environment

Edit the `.env` file with your configuration:

```bash
# Database Configuration
DATABASE_URL=postgresql://omnipair_user:your_secure_password@localhost:5432/omnipair_indexer

# Solana RPC Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_WS_URL=wss://api.mainnet-beta.solana.com

# For better performance, consider using dedicated RPC providers:
# SOLANA_RPC_URL=https://your-dedicated-rpc-endpoint.com
# SOLANA_WS_URL=wss://your-dedicated-ws-endpoint.com

# Logging
LOG_LEVEL=info
NODE_ENV=production

# Server
PORT=3000

# Optional: Telegram notifications
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

### Step 5: Run Database Migrations

```bash
# Navigate to database package
cd packages/database

# IMPORTANT: Create .env file in packages/database/ directory
# The database package looks for .env in its own directory, not the project root
cp ../../.env .env  # Copy from root, or create directly here

# Run migrations
bun run migrate

# Setup TimescaleDB hypertables and continuous aggregates
psql -U omnipair_user -d omnipair_indexer -f sql/setup-timescaledb.sql

# Return to root directory
cd ../..
```

### Step 6: Verify Installation

```bash
# Test database connection
bun run packages/database/src/run-sql.ts

# Start indexer in test mode (skip backfill)
bun run start --skip-backfill

# In another terminal, check health
curl http://localhost:3000/health
```

## 🚀 Production Deployment

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'omnipair-indexer',
    script: 'src/index.ts',
    interpreter: 'bun',
    args: 'start',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup
```

### Using Docker

```dockerfile
# Dockerfile
FROM oven/bun:1 as base
WORKDIR /app

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build
RUN bun run build

# Production stage
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/package.json ./

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
      POSTGRES_USER: omnipair_user
      POSTGRES_PASSWORD: your_secure_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/sql:/docker-entrypoint-initdb.d

  indexer:
    build: .
    environment:
      DATABASE_URL: postgresql://omnipair_user:your_secure_password@postgres:5432/omnipair_indexer
      SOLANA_RPC_URL: https://api.mainnet-beta.solana.com
      SOLANA_WS_URL: wss://api.mainnet-beta.solana.com
    ports:
      - "3000:3000"
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
```

## 🔧 Configuration Options

### Backfill Configuration

```bash
# Start with full historical backfill
bun run start

# Skip backfill (start from current block)
bun run start --skip-backfill

# Backfill from specific slot
bun run start --backfill-from-slot 250000000

# Backfill specific range (programmatic)
# Modify the code or use API endpoints
```

### Performance Tuning

#### Database Optimization
```sql
-- Increase shared_buffers (in postgresql.conf)
shared_buffers = 256MB

-- Increase work_mem
work_mem = 4MB

-- Enable TimescaleDB compression
SELECT add_compression_policy('transaction_details', INTERVAL '7 days');
```

#### RPC Optimization
```bash
# Use dedicated RPC endpoints for better performance
SOLANA_RPC_URL=https://your-dedicated-rpc.com
SOLANA_WS_URL=wss://your-dedicated-ws.com

# Consider using multiple RPC endpoints for load balancing
```

## 📊 Monitoring Setup

### Log Monitoring
```bash
# View real-time logs
tail -f logs/indexer.log

# Monitor with journalctl (if using systemd)
journalctl -u omnipair-indexer -f
```

### Health Checks
```bash
# Basic health check
curl http://localhost:3000/health

# Detailed status
curl http://localhost:3000/ | jq
```

### Database Monitoring
```sql
-- Check TimescaleDB status
SELECT * FROM timescaledb_information.hypertables;

-- Monitor query performance
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;

-- Check continuous aggregates
SELECT * FROM timescaledb_information.continuous_aggregates;
```

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check if TimescaleDB is loaded
psql -U omnipair_user -d omnipair_indexer -c "SELECT * FROM pg_extension WHERE extname = 'timescaledb';"

# Test connection
psql -U omnipair_user -d omnipair_indexer -c "SELECT version();"
```

#### Environment File Location Issues
**Error**: `role "User" does not exist` or `DATABASE_URL is undefined`

**Solution**: The database package looks for `.env` in its own directory, not the project root.

```bash
# If you have .env in project root, copy it to database package
cd packages/database
cp ../../.env .env

# Or create .env directly in packages/database/ directory
cd packages/database
# Create .env file with your DATABASE_URL here
```

#### RPC Issues
```bash
# Test RPC endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  $SOLANA_RPC_URL

# Check WebSocket connection
# Use a WebSocket testing tool or browser console
```

#### Memory Issues
```bash
# Monitor memory usage
ps aux | grep bun
free -h

# Adjust PM2 memory limit
pm2 restart omnipair-indexer --max-memory-restart 2G
```

#### Performance Issues
```bash
# Check database performance
psql -U omnipair_user -d omnipair_indexer -c "SELECT * FROM pg_stat_activity;"

# Monitor disk usage
df -h
du -sh /var/lib/postgresql/data/
```

### Recovery Procedures

#### Restart from Specific Slot
```bash
# Stop the indexer
pm2 stop omnipair-indexer

# Clear transaction watcher (if needed)
psql -U omnipair_user -d omnipair_indexer -c "DELETE FROM transaction_watchers WHERE acct = '3tJrAXnjofAw8oskbMaSo9oMAYuzdBgVbW3TvQLdMEBd';"

# Restart with specific slot
pm2 start omnipair-indexer -- --backfill-from-slot 250000000
```

#### Database Recovery
```bash
# Backup database
pg_dump -U omnipair_user omnipair_indexer > backup.sql

# Restore database
psql -U omnipair_user omnipair_indexer < backup.sql
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Run multiple indexer instances with different program IDs
- Use load balancers for API endpoints
- Implement database read replicas

### Vertical Scaling
- Increase server resources (CPU, RAM, Storage)
- Optimize database configuration
- Use faster storage (NVMe SSDs)

### Data Archival
```sql
-- Archive old data to cold storage
SELECT compress_chunk(chunk_name) 
FROM timescaledb_information.chunks 
WHERE chunk_name LIKE 'transaction_details%' 
AND range_start < NOW() - INTERVAL '1 year';
```

## 🔐 Security Considerations

### Database Security
```bash
# Use strong passwords
# Enable SSL connections
# Restrict network access
# Regular security updates
```

### API Security
```bash
# Implement rate limiting
# Use authentication for admin endpoints
# Monitor for suspicious activity
# Regular security audits
```

## 📞 Support

For additional support:
1. Check the troubleshooting section
2. Review logs for error details
3. Create an issue in the repository
4. Contact the development team

---

**Note**: This setup guide assumes a Linux environment. Adjust commands accordingly for macOS or Windows.

