import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// All positions endpoint - returns all borrow positions with pagination
router.get('/', DataController.getAllPositions);

// All liquidity positions endpoint - returns all liquidity positions with pagination
router.get('/liquidity', DataController.getAllLiquidityPositions);

export default router;
