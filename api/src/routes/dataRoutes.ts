import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// Swaps endpoint
router.get('/swaps', DataController.getSwaps);

// Dynamic swap volume endpoint - accepts hours parameter
router.get('/swap-volume/:hours', DataController.getSwapVolume);
router.get('/swap-volume', DataController.getSwapVolume); // Default to 24 hours

// Dynamic chart prices endpoint - accepts hours parameter
router.get('/chart-prices/:hours', DataController.getChartPrices);
router.get('/chart-prices', DataController.getChartPrices); // Default to 24 hours

// Dynamic fee paid endpoint - accepts hours parameter
router.get('/fee-paid/:hours', DataController.getFeePaid);
router.get('/fee-paid', DataController.getFeePaid); // Default to 24 hours

// APR endpoints
router.get('/swap-apr', DataController.getAPR);

export default router;