import { Router } from 'express';
import dataRoutes from './dataRoutes';
import userRoutes from './userRoutes';

const router = Router();

router.use('/api', dataRoutes);
router.use('/user', userRoutes);

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Omnipair Data API',
    version: '1.0.0',
    description: 'All endpoints require a pair address parameter to filter data for a specific trading pair.',
    endpoints: {
      swaps: '/api/swaps/:pairAddress',
      volume: {
        'swap-volume': '/api/swap-volume/:pairAddress (default: 24hrs)',
        'swap-volume-dynamic': '/api/swap-volume/:pairAddress/:hours',
      },
      'chart-prices': '/api/chart-prices/:pairAddress (default: 24hrs)',
      'chart-prices-dynamic': '/api/chart-prices/:pairAddress/:hours',
      'fee-paid': '/api/fee-paid/:pairAddress (default: 24hrs)',
      'fee-paid-dynamic': '/api/fee-paid/:pairAddress/:hours',
      'swap-apr': '/api/swap-apr/:pairAddress',
      'pool-info': '/api/poolInfo/:pairAddress',
      user : {
        'user-swaps': '/user/:address/swap-history'
      }
    },
    parameters: {
      pairAddress: 'Required - The address of the trading pair to query data for',
      hours: 'Optional - Number of hours to look back (defaults to 24)',
      address: 'Required for user endpoints - The user address to query swaps for'
    },
    examples: {
      'Get swaps for pair': '/api/swaps/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get 24h volume for pair': '/api/swap-volume/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get 48h volume for pair': '/api/swap-volume/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P/48',
      'Get 7 days chart prices': '/api/chart-prices/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P/168',
      'Get 30 days fee data': '/api/fee-paid/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P/720',
      'Get APR for pair': '/api/swap-apr/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get pool info for pair': '/api/poolInfo/HNCdPJgiJaffW2UsEhWFTW1Uty4HgsYLAhhvz58VDe7P',
      'Get swaps for user': '/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/swap-history'
    },
    notes: {
      'required-parameter': 'API endpoints require a pairAddress parameter, user endpoints require an address parameter',
      'data-filtering': 'API data is filtered by pair address, user endpoints filter by user address',
      'chart-intervals': 'Chart automatically selects intervals: ≤24hrs=1min, ≤168hrs=1hr, >168hrs=1day',
      'caching': 'Responses are cached per pair to improve performance',
      'user-endpoints': 'User endpoints provide access to all swaps performed by a specific user address'
    }
  });
});

export default router;
