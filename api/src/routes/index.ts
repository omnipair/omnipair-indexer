import { Router } from 'express';
import dataRoutes from './dataRoutes';

const router = Router();

router.use('/api', dataRoutes);

router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Omnipair Data API',
    version: '1.0.0',
    endpoints: {
      swaps: '/api/swaps',
      'swap-volume': '/api/swap-volume (default: 24hrs)',
      'swap-volume-dynamic': '/api/swap-volume/:hours (e.g. /api/swap-volume/48)',
      'chart-prices': '/api/chart-prices (default: 24hrs)',
      'chart-prices-dynamic': '/api/chart-prices/:hours (e.g. /api/chart-prices/168)',
      'fee-paid': '/api/fee-paid (default: 24hrs)',
      'fee-paid-dynamic': '/api/fee-paid/:hours (e.g. /api/fee-paid/720)',
      'swap-apr': '/api/swap-apr'
    },
    examples: {
      '24 hours data': '/api/swap-volume/24',
      '7 days data': '/api/chart-prices/168',
      '30 days data': '/api/fee-paid/720'
    },
    notes: {
      'dynamic-endpoints': 'All endpoints accept hours as parameter for custom time ranges',
      'chart-intervals': 'Chart automatically selects intervals: ≤24hrs=1min, ≤168hrs=1hr, >168hrs=1day'
    }
  });
});

export default router;
