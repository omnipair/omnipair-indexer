import { Router } from 'express';
import { V2MarketController } from '../../controllers/v2MarketController';

const router = Router();

router.get('/', V2MarketController.getMarkets);
router.get('/:marketAddress/swaps', V2MarketController.getMarketSwaps);
router.get('/:marketAddress', V2MarketController.getMarket);

export default router;
