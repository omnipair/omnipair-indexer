import { Router, Request, Response, NextFunction } from 'express';
import { PoolController } from '../../controllers/poolController';
import { SwapController } from '../../controllers/swapController';
import { UserController } from '../../controllers/userController';
import { MarketValueBaselineController } from '../../controllers/marketValueBaselineController';
import { BorrowRateHistoryController } from '../../controllers/borrowRateHistoryController';
import { MarketActivityController } from '../../controllers/marketActivityController';

const router = Router();

const normalizeWindowHours = (req: Request, res: Response, next: NextFunction) => {
  if (req.query.windowHours && !req.params.hours) {
    req.params.hours = req.query.windowHours as string;
  }
  next();
};

router.get('/', PoolController.getPools);
router.get('/tvl', PoolController.getTvl);
router.get('/value-baselines', MarketValueBaselineController.getValueBaselines);

router.get('/paired-tokens/:tokenAddress', async (req: Request, res: Response) => {
  req.params.token = req.params.tokenAddress;
  await PoolController.getTokensByToken(req, res);
});

router.get('/:poolAddress/stats', normalizeWindowHours, async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  await SwapController.getAPR(req, res);
});

router.get('/:poolAddress/rate-history', async (req: Request, res: Response) => {
  await BorrowRateHistoryController.getBorrowRateHistory(req, res);
});

router.get('/:poolAddress/volume', normalizeWindowHours, async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  if (!req.params.hours) {
    req.params.hours = '24';
  }
  await SwapController.getSwapVolume(req, res);
});

router.get('/:poolAddress/fees', normalizeWindowHours, async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  if (!req.params.hours) {
    req.params.hours = '24';
  }
  await SwapController.getFeePaid(req, res);
});

router.get('/:poolAddress/price-chart', normalizeWindowHours, async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  if (!req.params.hours) {
    req.params.hours = '24';
  }
  await SwapController.getChartPrices(req, res);
});

router.get('/:poolAddress/candles', async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  await SwapController.getCandles(req, res);
});

router.get('/:poolAddress/swaps', async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  await SwapController.getSwaps(req, res);
});

router.get('/:poolAddress/activity', async (req: Request, res: Response) => {
  await MarketActivityController.getMarketActivity(req, res);
});

router.get('/:poolAddress/liquidity-events', async (req: Request, res: Response) => {
  const poolAddress = req.params.poolAddress;
  const userAddress = req.query.userAddress as string | undefined;
  
  if (userAddress) {
    req.params.userAddress = userAddress;
    req.params.pair = poolAddress;
    await UserController.getUserHistory(req, res);
  } else {
    res.status(400).json({
      success: false,
      error: 'userAddress query parameter is required. Use ?userAddress=ADDRESS to filter by user.'
    });
  }
});

router.get('/:poolAddress/og', async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  await PoolController.getPoolOgCard(req, res);
});

router.get('/:poolAddress', async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  await PoolController.getPoolInfo(req, res);
});

export default router;
