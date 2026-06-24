import { Router } from 'express';
import { V2MarketController } from '../../controllers/v2MarketController';

const router = Router();

router.get('/', V2MarketController.getMarkets);
router.get('/:marketAddress/swaps', V2MarketController.getSwaps);
router.get('/:marketAddress/auctions', V2MarketController.getAuctions);
router.get('/:marketAddress/auction-settlements', V2MarketController.getAuctionSettlements);
router.get('/:marketAddress', V2MarketController.getMarket);

export default router;
