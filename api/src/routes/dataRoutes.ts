import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// Swaps endpoint
router.get('/swaps', DataController.getSwaps);

// Swap volume endpoints
router.get('/swap-volume', DataController.getSwapVolume);
router.get('/swap-volume/24hr', DataController.getSwapVolume24hr);
router.get('/swap-volume/1day', DataController.getSwapVolume1day);
router.get('/swap-volume/1week', DataController.getSwapVolume1week);
router.get('/swap-volume/1month', DataController.getSwapVolume1month);

// Chart prices endpoints
router.get('/chart-prices', DataController.getChartPrices);
router.get('/chart-prices/1m', DataController.getChartPrices1m);
router.get('/chart-prices/1h', DataController.getChartPrices1h);
router.get('/chart-prices/1d', DataController.getChartPrices1d);

export default router;
