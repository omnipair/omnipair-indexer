import { Request, Response } from 'express';
import pool from '../config/database';
import { ApiResponse } from '../types';
import { cache } from '../utils/cache';
import { isValidAddress } from './helpers/controllerBase';
import {
  getBorrowRateHistory,
  normalizeBorrowRateHistoryRange,
} from '../services/borrowRateHistoryService';

export class BorrowRateHistoryController {
  static async getBorrowRateHistory(req: Request, res: Response): Promise<void> {
    try {
      const poolAddress = req.params.poolAddress;

      if (!poolAddress || !isValidAddress(poolAddress)) {
        res.status(400).json({ success: false, error: 'Invalid pool address format' });
        return;
      }

      const normalizedRange = normalizeBorrowRateHistoryRange(req.query.range as string | undefined);
      const cacheKey = `borrow_rate_history:${poolAddress}:${normalizedRange.range}`;
      const data = await cache.getOrSet(cacheKey, 30_000, () =>
        getBorrowRateHistory(pool, poolAddress, { range: normalizedRange.range })
      );

      res.json({ success: true, data });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Unsupported range')) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }

      console.error('Error fetching borrow rate history:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch borrow rate history',
      };
      res.status(500).json(response);
    }
  }
}
