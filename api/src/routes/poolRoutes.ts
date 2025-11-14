import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// Pool information endpoint - requires pair address
router.get('/info/:pairAddress', DataController.getPoolInfo);

// APR endpoint - requires pair address
router.get('/apr/:pairAddress', DataController.getAPR);

// All pools endpoint - returns all pools with pagination
router.get('/', DataController.getPools);

// Paired tokens endpoint - returns all tokens paired with a given token
router.get('/paired-tokens/:token', DataController.getTokensByToken);

// Pools by tokens endpoint - returns all pools matching two tokens
router.get('/:token0/:token1', DataController.getPoolsByTokens);

export default router;
