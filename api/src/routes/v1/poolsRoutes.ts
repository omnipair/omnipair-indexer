import { Router, Request, Response, NextFunction } from 'express';
import { DataController } from '../../controllers/dataController';

const router = Router();

const normalizeWindowHours = (req: Request, res: Response, next: NextFunction) => {
  if (req.query.windowHours && !req.params.hours) {
    req.params.hours = req.query.windowHours as string;
  }
  next();
};

router.get('/', DataController.getPools);

// POST because it receives a list of oLP token mints
// body: { "olpMints": ["mint1", "mint2"] }
router.post('/olp-value', async (req: Request, res: Response) => {
  await DataController.getOlpTokenValue(req, res);
});

router.get('/paired-tokens/:tokenAddress', async (req: Request, res: Response) => {
  req.params.token = req.params.tokenAddress;
  await DataController.getTokensByToken(req, res);
});

router.get('/:poolAddress/stats', normalizeWindowHours, async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  await DataController.getAPR(req, res);
});

router.get('/:poolAddress/volume', normalizeWindowHours, async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  if (!req.params.hours) {
    req.params.hours = '24';
  }
  await DataController.getSwapVolume(req, res);
});

router.get('/:poolAddress/fees', normalizeWindowHours, async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  if (!req.params.hours) {
    req.params.hours = '24';
  }
  await DataController.getFeePaid(req, res);
});

router.get('/:poolAddress/price-chart', normalizeWindowHours, async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  if (!req.params.hours) {
    req.params.hours = '24';
  }
  await DataController.getChartPrices(req, res);
});

router.get('/:poolAddress/swaps', async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  await DataController.getSwaps(req, res);
});

router.get('/:poolAddress/liquidity-events', async (req: Request, res: Response) => {
  const poolAddress = req.params.poolAddress;
  const userAddress = req.query.userAddress as string | undefined;
  
  if (userAddress) {
    req.params.userAddress = userAddress;
    req.params.pair = poolAddress;
    await DataController.getUserHistory(req, res);
  } else {
    res.status(400).json({
      success: false,
      error: 'userAddress query parameter is required. Use ?userAddress=ADDRESS to filter by user.'
    });
  }
});

router.get('/:poolAddress', async (req: Request, res: Response) => {
  req.params.pairAddress = req.params.poolAddress;
  await DataController.getPoolInfo(req, res);
});

export default router;

