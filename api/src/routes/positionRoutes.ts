import { Router } from 'express';
import { DataController } from '../controllers/dataController';

const router = Router();

// All positions endpoint - returns all positions with pagination
router.get('/', DataController.getAllPositions);

export default router;
