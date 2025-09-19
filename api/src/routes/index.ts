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
      'swap-volume-all': '/api/swap-volume',
      'swap-volume-24hr': '/api/swap-volume/24hr',
      'swap-volume-1day': '/api/swap-volume/1day',
      'swap-volume-1week': '/api/swap-volume/1week',
      'swap-volume-1month': '/api/swap-volume/1month',
      'chart-prices': '/api/chart-prices'
    }
  });
});

export default router;
