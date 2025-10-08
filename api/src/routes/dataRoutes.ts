import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// Swaps endpoint - requires pair address
router.get('/swaps/:pairAddress', DataController.getSwaps);

// Dynamic swap volume endpoint - accepts pair address and optional hours parameter
router.get('/swap-volume/:pairAddress/:hours', DataController.getSwapVolume);
router.get('/swap-volume/:pairAddress', DataController.getSwapVolume); // Default to 24 hours

// Dynamic chart prices endpoint - accepts pair address and optional hours parameter
router.get('/chart-prices/:pairAddress/:hours', DataController.getChartPrices);
router.get('/chart-prices/:pairAddress', DataController.getChartPrices); // Default to 24 hours

// Dynamic fee paid endpoint - accepts pair address and optional hours parameter
router.get('/fee-paid/:pairAddress/:hours', DataController.getFeePaid);
router.get('/fee-paid/:pairAddress', DataController.getFeePaid); // Default to 24 hours

// APR endpoints - requires pair address
router.get('/swap-apr/:pairAddress', DataController.getAPR);

router.get('/pool-info/:pairAddress', DataController.getPoolInfo);

export default router;