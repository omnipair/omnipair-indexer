import { Router, Request, Response } from 'express';
import { DataController } from '../../controllers/dataController';

const router = Router();

router.get('/:userAddress/swaps', async (req: Request, res: Response) => {
  if (req.query.poolAddress) {
    req.params.pairAddress = req.query.poolAddress as string;
  }
  await DataController.getSwaps(req, res);
});

router.get('/:userAddress/liquidity-events', async (req: Request, res: Response) => {
  if (req.query.poolAddress) {
    req.params.pair = req.query.poolAddress as string;
  } else {
    res.status(400).json({
      success: false,
      error: 'poolAddress query parameter is required. Use ?poolAddress=POOL_ADDRESS to filter by pool.'
    });
    return;
  }
  await DataController.getUserHistory(req, res);
});

router.get('/:userAddress/lending-events', async (req: Request, res: Response) => {
  await DataController.getUserLendingHistory(req, res);
});

router.get('/:userAddress/positions', async (req: Request, res: Response) => {
  req.query.userAddress = req.params.userAddress;
  await DataController.getAllPositions(req, res);
});

export default router;

