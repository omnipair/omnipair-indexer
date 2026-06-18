import { Router } from 'express';
import { V2MarketController } from '../../controllers/v2MarketController';

const router = Router();

router.get('/:wallet/positions', V2MarketController.getUserPositions);
router.get('/:wallet/activity', V2MarketController.getUserActivity);

export default router;
