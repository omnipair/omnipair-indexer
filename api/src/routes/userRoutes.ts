import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// User swaps endpoint - returns all swaps for a specific user address
router.get('/:userAddress/swap-history', DataController.getSwaps);

// User history endpoint - returns liquidity adjustment data for a specific user and pair
router.get('/:userAddress/history/:pair', DataController.getUserHistory);

// User lending history endpoint - returns all lending/borrowing activities for a specific user
router.get('/:userAddress/lending-history', DataController.getUserLendingHistory);

export default router;
