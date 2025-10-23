import { Router } from 'express';
import poolRoutes from './poolRoutes';
import swapRoutes from './swapRoutes';
import userRoutes from './userRoutes';
import positionRoutes from './positionRoutes';

const router = Router();

// Category-based routing
router.use('/pool', poolRoutes);
router.use('/swap', swapRoutes);
router.use('/user', userRoutes);
router.use('/position', positionRoutes);

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Omnipair Data API',
    version: '1.0.0',
    description: 'All endpoints require a pair address parameter to filter data for a specific trading pair.',
    endpoints: {
      pools: {
        'all-pools': '/pool/',
        'pool-info': '/pool/info/:pairAddress',
        'pool-apr': '/pool/apr/:pairAddress'
      },
      swaps: {
        'swaps': '/swap/:pairAddress',
        'volume': '/swap/volume/:pairAddress (default: 24hrs)',
        'volume-dynamic': '/swap/volume/:pairAddress/:hours',
        'chart-prices': '/swap/chart-prices/:pairAddress (default: 24hrs)',
        'chart-prices-dynamic': '/swap/chart-prices/:pairAddress/:hours',
        'fee-paid': '/swap/fee-paid/:pairAddress (default: 24hrs)',
        'fee-paid-dynamic': '/swap/fee-paid/:pairAddress/:hours'
      },
      users: {
        'swap-history': '/user/:userAddress/swap-history',
        'liquidity-history': '/user/:userAddress/history/:pair',
        'positions': '/user/:userAddress/positions',
        'lending-history': '/user/:userAddress/lending-history'
      },
      positions: {
        'all-positions': '/position/'
      }
    },
    parameters: {
      pairAddress: 'Required - The address of the trading pair to query data for',
      hours: 'Optional - Number of hours to look back (defaults to 24)',
      userAddress: 'Required for user endpoints - The user address to query data for',
      pair: 'Required for user-history endpoint - The pair address to query liquidity history for',
      limit: 'Optional - Number of results to return (defaults to 100, max 1000)',
      offset: 'Optional - Number of results to skip for pagination (defaults to 0)',
      sortBy: 'Optional - Field to sort by (id, timestamp, amount0, amount1, liquidity)',
      sortOrder: 'Optional - Sort order (asc, desc)'
    },
    examples: {
      'Get all pools with APR and fees': '/pool/?limit=10&offset=0',
      'Get pool info for pair': '/pool/info/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get APR for pair': '/pool/apr/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get swaps for pair': '/swap/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get 24h volume for pair': '/swap/volume/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get 48h volume for pair': '/swap/volume/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P/48',
      'Get 7 days chart prices': '/swap/chart-prices/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P/168',
      'Get 30 days fee data': '/swap/fee-paid/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P/720',
      'Get swaps for user': '/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/swap-history',
      'Get user liquidity history': '/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/history/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get user liquidity history with pagination': '/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/history/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P?limit=50&sortBy=timestamp&sortOrder=desc',
      'Get user positions': '/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/positions',
      'Get user lending history': '/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/lending-history',
      'Get user lending history with pagination': '/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/lending-history?limit=50&offset=0',
      'Get all positions': '/position/?limit=50&offset=0'
    },
    notes: {
      'api-structure': 'API is organized by categories: /pool/ for pool data, /swap/ for swap data, /user/ for user data, /position/ for position data',
      'required-parameters': 'Pool and swap endpoints require a pairAddress parameter, user endpoints require an address parameter',
      'data-filtering': 'Pool and swap data is filtered by pair address, user endpoints filter by user address',
      'chart-intervals': 'Chart automatically selects intervals: ≤24hrs=1min, ≤168hrs=1hr, >168hrs=1day',
      'caching': 'Responses are cached per pair to improve performance',
      'user-endpoints': 'User endpoints provide access to all swaps, liquidity history, positions, and lending/borrowing activities for a specific user address',
      'lending-history': 'Lending history endpoint combines collateral adjustments, debt adjustments, liquidations, and position updates for comprehensive lending activity tracking',
      'pagination': 'Most endpoints support pagination with limit and offset parameters'
    }
  });
});

export default router;
