import { Router } from 'express';
import poolsRoutes from './v1/poolsRoutes';
import usersRoutes from './v1/usersRoutes';
import positionsRoutes from './v1/positionsRoutes';
import statsRoutes from './v1/statsRoutes';
import coingeckoRoutes from './v1/coingeckoRoutes';
import cmcApiRoutes from './v1/cmcApiRoutes';
import geckoTerminalRoutes from './v1/geckoTerminalRoutes';

const router = Router();

router.use('/api/v1/cmc', cmcApiRoutes);
router.use('/api/v1/pools', poolsRoutes);
router.use('/api/v1/users', usersRoutes);
router.use('/api/v1/positions', positionsRoutes);
router.use('/api/v1/stats', statsRoutes);
router.use('/api/v1/coingecko', coingeckoRoutes);
router.use('/api/v1/gecko', geckoTerminalRoutes);

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Omnipair Data API',
    version: '1.0.0',
    baseUrl: '/api/v1',
    endpoints: {
      pools: {
        'list-pools': 'GET /api/v1/pools?token0=ADDR&token1=ADDR&limit=100&offset=0&sortBy=tvl&sortOrder=desc',
        'pool-info': 'GET /api/v1/pools/{poolAddress}',
        'pool-stats': 'GET /api/v1/pools/{poolAddress}/stats?windowHours=24',
        'pool-volume': 'GET /api/v1/pools/{poolAddress}/volume?windowHours=24',
        'pool-fees': 'GET /api/v1/pools/{poolAddress}/fees?windowHours=24',
        'price-chart': 'GET /api/v1/pools/{poolAddress}/price-chart?windowHours=24',
        'borrow-rate-history': 'GET /api/v1/pools/{poolAddress}/rate-history?range=1H|2H|4H|12H|24H|7D|30D',
        'pool-swaps': 'GET /api/v1/pools/{poolAddress}/swaps?limit=100&offset=0',
        'activity': 'GET /api/v1/pools/{poolAddress}/activity?categories=swaps,liquidity,lending&limit=100&offset=0&sort=recent',
        'liquidity-events': 'GET /api/v1/pools/{poolAddress}/liquidity-events?userAddress=ADDR',
        'paired-tokens': 'GET /api/v1/pools/paired-tokens/{tokenAddress}'
      },
      users: {
        'user-swaps': 'GET /api/v1/users/{userAddress}/swaps?poolAddress=ADDR&limit=100&offset=0',
        'liquidity-events': 'GET /api/v1/users/{userAddress}/liquidity-events?poolAddress=ADDR&limit=100&offset=0',
        'lending-events': 'GET /api/v1/users/{userAddress}/lending-events?poolAddress=ADDR&limit=100&offset=0',
        'activity': 'GET /api/v1/users/{userAddress}/activity?categories=swaps,liquidity,lending&poolAddress=ADDR&limit=100&offset=0&sort=recent',
        'portfolio-snapshots': 'GET /api/v1/users/{userAddress}/portfolio-snapshots?range=7D|30D|90D|ALL',
        'lp-earnings': 'GET /api/v1/users/{userAddress}/lp-earnings?range=7D|30D|90D|ALL&poolAddress=ADDR',
        'user-positions': 'GET /api/v1/users/{userAddress}/positions?poolAddress=ADDR&type=liquidity&status=open'
      },
      positions: {
        'list-positions': 'GET /api/v1/positions?userAddress=ADDR&poolAddress=ADDR&type=liquidity&status=open&limit=100&offset=0',
        'liquidity-positions': 'GET /api/v1/positions/liquidity?userAddress=ADDR&poolAddress=ADDR&limit=100&offset=0',
        'single-position': 'GET /api/v1/positions/{positionId}'
      },
      stats: {
        'protocol-stats': 'GET /api/v1/stats',
        'volume-chart': 'GET /api/v1/stats/volume-chart?timeframe=7d',
        'fees-chart': 'GET /api/v1/stats/fees-chart?timeframe=7d',
        'interest-chart': 'GET /api/v1/stats/interest-chart?timeframe=7d'
      },
      coingecko: {
        'tickers': 'GET /api/v1/coingecko/tickers'
      },
      cmc: {
        docs: 'GET /api/v1/cmc/docs — HTML reference for CMC endpoints',
        factory: 'GET /api/v1/cmc/factory (Solana program id)',
        fees: 'GET /api/v1/cmc/fees — HTML table of all visible pools and their swap fees',
        'deposit-withdraw-fees': 'GET /api/v1/cmc/deposit-withdraw-fees — HTML table of all visible pools (deposit 0%, withdraw 1%)',
        summary: 'GET /api/v1/cmc/summary',
        assets: 'GET /api/v1/cmc/assets',
        ticker: 'GET /api/v1/cmc/ticker',
        trades: 'GET /api/v1/cmc/trades/:market_pair (full 24h, no pagination; market_pair = mint0_mint1)'
      },
      gecko: {
        'latest-block': 'GET /api/v1/gecko/latest-block',
        asset: 'GET /api/v1/gecko/asset?id=<mint>',
        pair: 'GET /api/v1/gecko/pair?id=<pair_address>',
        events: 'GET /api/v1/gecko/events?fromBlock=<slot>&toBlock=<slot> (inclusive; max 50000 slots)'
      }
    },
    parameters: {
      poolAddress: 'Required - The address of the trading pool',
      tokenAddress: 'Required - The address of a token mint',
      token0: 'Optional - The address of the first token (query param)',
      token1: 'Optional - The address of the second token (query param)',
      windowHours: 'Optional - Number of hours to look back (defaults to 24)',
      userAddress: 'Required for user endpoints - The user address to query data for',
      categories: 'Optional - Comma-separated activity categories (swaps, liquidity, lending)',
      limit: 'Optional - Number of results to return (defaults to 100, max 100)',
      offset: 'Optional - Number of results to skip for pagination (defaults to 0)',
      sort: 'Optional - Activity sorting direction (recent, oldest)',
      sortBy: 'Optional - Field to sort by (id, timestamp, amount0, amount1, liquidity, tvl, volume24h, apr)',
      sortOrder: 'Optional - Sort order (asc, desc)',
      type: 'Optional - Filter by position type (liquidity, lending, borrow, long, short, all)',
      status: 'Optional - Filter by position status (open, closed, all)'
    },
    notes: {
      'chart-intervals': 'Chart automatically selects intervals: ≤24hrs=1min, ≤168hrs=1hr, >168hrs=1day',
      'caching': 'Responses are cached per pool to improve performance',
      'pagination': 'Most endpoints support pagination with limit and offset parameters',
      'pool-fields': 'Pool endpoints return swap_fee_bps (swap fee in basis points) and fixed_cf_bps (fixed collateral factor in basis points)'
    }
  });
});

export default router;
