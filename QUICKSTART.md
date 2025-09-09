# Omnipair Indexer Quick Start Guide

Get the Omnipair indexer up and running in 5 minutes!

## 🚀 Quick Setup

### 1. Prerequisites
Make sure you have these installed:
- **Node.js 18+**: [Download here](https://nodejs.org/)
- **Bun**: Run `curl -fsSL https://bun.sh/install | bash`
- **PostgreSQL 14+**: [Download here](https://www.postgresql.org/download/)

### 2. Clone and Install
```bash
# Clone the repository
git clone <repository-url>
cd omnipair-indexer

# Install dependencies
bun install
```

### 3. Database Setup
```bash
# Create database (replace with your PostgreSQL credentials)
createdb omnipair_indexer

# Enable TimescaleDB extension
psql omnipair_indexer -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

# Run migrations
cd packages/database

# IMPORTANT: Create .env file in packages/database/ directory
# The database package looks for .env in its own directory, not the project root
cp ../../.env .env  # Copy from root, or create directly here

bun run migrate
psql omnipair_indexer -f sql/setup-timescaledb.sql
cd ../..
```

### 4. Configure Environment
```bash
# Copy environment template
cp env.template .env

# Edit .env with your database credentials
# Update DATABASE_URL with your PostgreSQL connection string
```

### 5. Start the Indexer
```bash
# Start with full backfill (recommended for first run)
bun run start

# Or start from current block only
bun run start --skip-backfill
```

### 6. Verify It's Working
```bash
# Check health status
curl http://localhost:3000/health

# View status page
open http://localhost:3000/
```

## 🎯 What Happens Next

1. **Initial Backfill**: The indexer will process all historical Omnipair transactions
2. **Real-time Monitoring**: After backfill, it switches to live transaction monitoring
3. **Data Storage**: All data is stored in PostgreSQL with TimescaleDB optimization
4. **Health Monitoring**: The indexer runs health checks and gap filling automatically

## 📊 Key Features

- ✅ **Real-time Transaction Indexing**: Live monitoring of Omnipair protocol
- ✅ **Historical Backfilling**: Complete historical data processing
- ✅ **User Position Tracking**: Monitor collateral, debt, and health factors
- ✅ **Price Feed Construction**: Built from spot swap transactions
- ✅ **TimescaleDB Integration**: Optimized for time-series analytics
- ✅ **Gap Detection**: Automatic detection of missed transactions
- ✅ **Rate Limiting**: Built-in RPC protection
- ✅ **Health Monitoring**: Comprehensive status and health checks

## 🔧 Common Commands

```bash
# Development mode with file watching
bun run dev

# Start from specific slot
bun run start --backfill-from-slot 250000000

# Manual backfill via API
curl -X POST http://localhost:3000/backfill

# Manual gap fill via API
curl -X POST http://localhost:3000/gap-fill

# Check logs
tail -f logs/indexer.log
```

## 🚨 Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U postgres -d omnipair_indexer -c "SELECT version();"
```

### Environment File Location Issues
**Error**: `role "User" does not exist` or `DATABASE_URL is undefined`

**Solution**: The database package looks for `.env` in its own directory, not the project root.

```bash
# If you have .env in project root, copy it to database package
cd packages/database
cp ../../.env .env

# Or create .env directly in packages/database/ directory
```

### RPC Issues
```bash
# Test RPC endpoint
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
  https://api.mainnet-beta.solana.com
```

### Memory Issues
```bash
# Monitor memory usage
ps aux | grep bun
free -h
```

## 📈 Next Steps

1. **Monitor Performance**: Check the health endpoint regularly
2. **Set Up Alerts**: Configure Telegram notifications for errors
3. **Scale Up**: Consider dedicated RPC endpoints for better performance
4. **Analytics**: Use the indexed data for your applications
5. **Customization**: Modify the code for your specific needs

## 📚 Documentation

- **[Full Setup Guide](SETUP.md)**: Detailed installation instructions
- **[API Documentation](API.md)**: Complete API reference
- **[Development Guide](DEVELOPMENT.md)**: Developer documentation
- **[Main README](README.md)**: Comprehensive overview

## 🆘 Need Help?

- Check the [troubleshooting section](SETUP.md#troubleshooting)
- Review the logs for error details
- Create an issue in the repository
- Contact the development team

---

**🎉 Congratulations!** Your Omnipair indexer is now running and processing blockchain data!

