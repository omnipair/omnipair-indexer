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

// Pools endpoint - returns all pools with pagination
router.get('/pools', DataController.getPools);

// User history endpoint - returns liquidity adjustment data for a specific user and pair
router.get('/user-history/:userAddress/:pair', DataController.getUserHistory);

// User positions endpoint
router.get('/user-positions/:userAddress', DataController.getUserPositions);

// All positions endpoint - returns all positions
router.get('/positions', DataController.getAllPositions);

export default router;