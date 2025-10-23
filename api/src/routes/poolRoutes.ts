import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// Pool information endpoint - requires pair address
router.get('/info/:pairAddress', DataController.getPoolInfo);

// APR endpoint - requires pair address
router.get('/apr/:pairAddress', DataController.getAPR);

// All pools endpoint - returns all pools with pagination
router.get('/', DataController.getPools);

export default router;
