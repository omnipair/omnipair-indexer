import { Request, Response } from 'express';
import pool from '../config/database';
import { ApiResponse, Swap } from '../types';
import { cache } from '../utils/cache';

export class DataController {
  static async getSwaps(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000); 
      const offset = parseInt(req.query.offset as string) || 0;
      const countResult = await pool.query('SELECT COUNT(*) FROM swaps');
      const totalCount = parseInt(countResult.rows[0].count);
      
      const result = await pool.query(
        'SELECT * FROM swaps ORDER BY id DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      
      const response: ApiResponse<{
        swaps: Swap[];
        pagination: {
          total: number;
          limit: number;
          offset: number;
          hasNext: boolean;
        };
      }> = {
        success: true,
        data: {
          swaps: result.rows,
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasNext: offset + limit < totalCount
          }
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching swaps:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch swaps'
      };
      res.status(500).json(response);
    }
  }

  static async getSwapVolume(req: Request, res: Response): Promise<void> {
    try {
      const hours = req.params.hours ? parseInt(req.params.hours) : 24;
      
      if (isNaN(hours) || hours <= 0) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid hours parameter. Must be a positive number.'
        };
        res.status(400).json(response);
        return;
      }

      const cacheKey = `swap_volume_${hours}hrs`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      // Calculate volume for the specified period
      const now = Math.floor(Date.now() / 1000);
      const timestamp = now - (hours * 60 * 60);
      
      const result = await pool.query(`
        SELECT 
          SUM(CASE WHEN is_token0_in = true THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume0,
          SUM(CASE WHEN is_token0_in = false THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume1
        FROM swaps 
        WHERE timestamp > to_timestamp($1)
      `, [timestamp]);

      const volumeData = {
        volume0: result.rows[0].total_volume0 || '0',
        volume1: result.rows[0].total_volume1 || '0'
      };
      
      const responseData = {
        ...volumeData,
        period: `${hours}hrs`,
        hours: hours
      };

      cache.set(cacheKey, responseData, 15 * 1000);
      
      const response: ApiResponse = {
        success: true,
        data: responseData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching swap volume:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch swap volume'
      };
      res.status(500).json(response);
    }
  }

  static async getChartPrices(req: Request, res: Response): Promise<void> {
    try {
      const hours = req.params.hours ? parseInt(req.params.hours) : 24;
      
      if (isNaN(hours) || hours <= 0) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid hours parameter. Must be a positive number.'
        };
        res.status(400).json(response);
        return;
      }

      // Determine appropriate bucket interval based on time range
      let bucketInterval: string;
      let intervalLabel: string;
      
      if (hours <= 24) {
        bucketInterval = '1 minute';
        intervalLabel = '1 minute';
      } else if (hours <= 168) { // 7 days
        bucketInterval = '1 hour';
        intervalLabel = '1 hour';
      } else {
        bucketInterval = '1 day';
        intervalLabel = '1 day';
      }

      // Get chart prices for the specified period
      const timeInterval = `${hours} hours`;
      const result = await pool.query(`
        SELECT
          time_bucket_gapfill($1, timestamp,
            start => now() - interval '${timeInterval}',
            finish => now()
          ) AS bucket,
          LOCF(AVG(reserve1::numeric / NULLIF(reserve0,0))) AS price
        FROM swaps
        WHERE timestamp >= now() - interval '${timeInterval}'
        GROUP BY bucket
        ORDER BY bucket
      `, [bucketInterval]);

      const data = {
        prices: result.rows,
        period: `${hours} hours`,
        interval: intervalLabel,
        hours: hours
      };

      const response: ApiResponse = {
        success: true,
        data: data
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching chart prices:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch chart prices'
      };
      res.status(500).json(response);
    }
  }

  static async getFeePaid(req: Request, res: Response): Promise<void> {
    try {
      const hours = req.params.hours ? parseInt(req.params.hours) : 24;
      
      if (isNaN(hours) || hours <= 0) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid hours parameter. Must be a positive number.'
        };
        res.status(400).json(response);
        return;
      }

      const cacheKey = `fee_paid_${hours}hrs`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      // Calculate fee paid for the specified period
      const now = Math.floor(Date.now() / 1000);
      const timestamp = now - (hours * 60 * 60);
      
      const result = await pool.query(`
        SELECT 
          SUM(fee_paid0::numeric) as total_fee_paid0,
          SUM(fee_paid1::numeric) as total_fee_paid1
        FROM swaps 
        WHERE timestamp > to_timestamp($1)
      `, [timestamp]);

      const feeData = {
        total_fee_paid_in_token0: result.rows[0].total_fee_paid0 || '0',
        total_fee_paid_in_token1: result.rows[0].total_fee_paid1 || '0'
      };
      
      const responseData = {
        ...feeData,
        period: `${hours}hrs`,
        hours: hours
      };

      cache.set(cacheKey, responseData, 15 * 1000);
    
      const response: ApiResponse = {
        success: true,
        data: responseData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching fee paid:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch fee paid'
      };
      res.status(500).json(response);
    }
  }

  static async getAPR(req: Request, res: Response): Promise<void> {
    try {
      const cacheKey = 'apr_data';
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const day = 24 * 60 * 60;

      // Get fees from the last 24 hours and calculate average liquidity
      const result = await pool.query(`
        WITH daily_stats AS (
          SELECT 
            SUM(fee_paid0::numeric) as daily_fee0,
            SUM(fee_paid1::numeric) as daily_fee1,
            AVG(reserve0::numeric) as avg_reserve0,
            AVG(reserve1::numeric) as avg_reserve1
          FROM swaps 
          WHERE timestamp > to_timestamp($1) 
            AND reserve0 > 0 
            AND reserve1 > 0
        )
        SELECT 
          ds.daily_fee0,
          ds.daily_fee1,
          ds.avg_reserve0,
          ds.avg_reserve1
        FROM daily_stats ds
      `, [now - day]);

      if (result.rows.length === 0) {
        const response: ApiResponse = {
          success: true,
          data: {
            apr: '0',
            apr_breakdown: {
              token0_apr: '0',
              token1_apr: '0'
            }
          }
        };
        res.json(response);
        return;
      }

      const row = result.rows[0];
      const dailyFee0 = parseFloat(row.daily_fee0 || '0');
      const dailyFee1 = parseFloat(row.daily_fee1 || '0');
      const avgReserve0 = parseFloat(row.avg_reserve0 || '0');
      const avgReserve1 = parseFloat(row.avg_reserve1 || '0');

      /**
       * dailyFee0 is the total fees paid represented in token0
       * avgReserve0 is average reserve of token0
       * APR = total fees paid (in token0 or in token1) / total liquidity (2 * (reserve0 or reserve1)) * 365 * 100
       * the only difference between token0APR and token1APR is the change in token prices but both should be almost the same depending on timeframe
       */
      const token0APR = avgReserve0 > 0 ? (dailyFee0 / (avgReserve0 * 2)) * 365 * 100 : 0;
      const token1APR = avgReserve1 > 0 ? (dailyFee1 / (avgReserve1 * 2)) * 365 * 100 : 0;

      const aprData = {
        apr: (token0APR + token1APR) / 2,
        apr_breakdown: {
          token0_apr: token0APR,
          token1_apr: token1APR
        }
      };

      // Cache for 15 seconds
      cache.set(cacheKey, aprData, 15 * 1000);

      const response: ApiResponse = {
        success: true,
        data: aprData
      };

      res.json(response);
    } catch (error) {
      console.error('Error calculating APR:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to calculate APR'
      };
      res.status(500).json(response);
    }
  }
}
