import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// User swaps endpoint - returns all swaps for a specific user address
router.get('/:address/swap-history', DataController.getSwaps);

export default router;
