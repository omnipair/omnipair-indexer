import { Router } from 'express';
import poolsRoutes from './v1/poolsRoutes';
import usersRoutes from './v1/usersRoutes';
import positionsRoutes from './v1/positionsRoutes';

const router = Router();

router.use('/api/v1/pools', poolsRoutes);
router.use('/api/v1/users', usersRoutes);
router.use('/api/v1/positions', positionsRoutes);

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
        'pool-swaps': 'GET /api/v1/pools/{poolAddress}/swaps?limit=100&offset=0',
        'liquidity-events': 'GET /api/v1/pools/{poolAddress}/liquidity-events?userAddress=ADDR',
        'paired-tokens': 'GET /api/v1/pools/paired-tokens/{tokenAddress}',
        'olp-value': 'POST /api/v1/pools/olp-value  body: { "olpMints": ["mint1", "mint2"] }'
      },
      users: {
        'user-swaps': 'GET /api/v1/users/{userAddress}/swaps?poolAddress=ADDR&limit=100&offset=0',
        'liquidity-events': 'GET /api/v1/users/{userAddress}/liquidity-events?poolAddress=ADDR&limit=100&offset=0',
        'lending-events': 'GET /api/v1/users/{userAddress}/lending-events?poolAddress=ADDR&limit=100&offset=0',
        'user-positions': 'GET /api/v1/users/{userAddress}/positions?poolAddress=ADDR&type=liquidity&status=open'
      },
      positions: {
        'list-positions': 'GET /api/v1/positions?userAddress=ADDR&poolAddress=ADDR&type=liquidity&status=open&limit=100&offset=0',
        'liquidity-positions': 'GET /api/v1/positions/liquidity?userAddress=ADDR&poolAddress=ADDR&limit=100&offset=0',
        'single-position': 'GET /api/v1/positions/{positionId}'
      }
    },
    parameters: {
      poolAddress: 'Required - The address of the trading pool',
      tokenAddress: 'Required - The address of a token mint',
      token0: 'Optional - The address of the first token (query param)',
      token1: 'Optional - The address of the second token (query param)',
      windowHours: 'Optional - Number of hours to look back (defaults to 24)',
      userAddress: 'Required for user endpoints - The user address to query data for',
      limit: 'Optional - Number of results to return (defaults to 100, max 1000)',
      offset: 'Optional - Number of results to skip for pagination (defaults to 0)',
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
