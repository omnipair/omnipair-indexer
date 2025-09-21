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
        const cacheKey = 'swap_volumes_all';
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
        const timestamps = {
          hour24: now - day,
          day1: now - day,
          week1: now - (7 * day),
          month1: now - (30 * day)
        };

        const result = await pool.query(`
          SELECT 
            -- 24hr volumes
            SUM(CASE WHEN timestamp > to_timestamp($1) AND is_token0_in = true THEN amount_in::numeric 
                     WHEN timestamp > to_timestamp($1) AND is_token0_in = false THEN amount_out::numeric 
                     ELSE 0 END) as vol0_24hr,
            SUM(CASE WHEN timestamp > to_timestamp($1) AND is_token0_in = false THEN amount_in::numeric 
                     WHEN timestamp > to_timestamp($1) AND is_token0_in = true THEN amount_out::numeric 
                     ELSE 0 END) as vol1_24hr,
            
            -- 1 week volumes  
            SUM(CASE WHEN timestamp > to_timestamp($2) AND is_token0_in = true THEN amount_in::numeric 
                     WHEN timestamp > to_timestamp($2) AND is_token0_in = false THEN amount_out::numeric 
                     ELSE 0 END) as vol0_1week,
            SUM(CASE WHEN timestamp > to_timestamp($2) AND is_token0_in = false THEN amount_in::numeric 
                     WHEN timestamp > to_timestamp($2) AND is_token0_in = true THEN amount_out::numeric 
                     ELSE 0 END) as vol1_1week,
            
            -- 1 month volumes
            SUM(CASE WHEN timestamp > to_timestamp($3) AND is_token0_in = true THEN amount_in::numeric 
                     WHEN timestamp > to_timestamp($3) AND is_token0_in = false THEN amount_out::numeric 
                     ELSE 0 END) as vol0_1month,
            SUM(CASE WHEN timestamp > to_timestamp($3) AND is_token0_in = false THEN amount_in::numeric 
                     WHEN timestamp > to_timestamp($3) AND is_token0_in = true THEN amount_out::numeric 
                     ELSE 0 END) as vol1_1month
          FROM swaps 
          WHERE timestamp IS NOT NULL
        `, [timestamps.hour24, timestamps.week1, timestamps.month1]);

        const row = result.rows[0];
        const volumeData = {
          '24hr': {
            volume0: row.vol0_24hr || '0',
            volume1: row.vol1_24hr || '0'
          },
          '1day': {
            volume0: row.vol0_24hr || '0', 
            volume1: row.vol1_24hr || '0'
          },
          '1week': {
            volume0: row.vol0_1week || '0',
            volume1: row.vol1_1week || '0'
          },
          '1month': {
            volume0: row.vol0_1month || '0',
            volume1: row.vol1_1month || '0'
          }
        };

        cache.set(cacheKey, volumeData, 15 * 1000);
      
        const response: ApiResponse = {
          success: true,
          data: volumeData
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

  private static async getVolumeForPeriod(hours: number): Promise<{ volume0: string, volume1: string }> {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = now - (hours * 60 * 60);
    
    const result = await pool.query(`
      SELECT 
        SUM(CASE WHEN is_token0_in = true THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume0,
        SUM(CASE WHEN is_token0_in = false THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume1
      FROM swaps 
      WHERE timestamp > to_timestamp($1)
    `, [timestamp]);

    return {
      volume0: result.rows[0].total_volume0 || '0',
      volume1: result.rows[0].total_volume1 || '0'
    };
  }

  static async getSwapVolume24hr(req: Request, res: Response): Promise<void> {
    try {
      const volumeData = await DataController.getVolumeForPeriod(24);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...volumeData,
          period: '24hr'
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 24hr swap volume:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 24hr swap volume'
      };
      res.status(500).json(response);
    }
  }

  static async getSwapVolume1day(req: Request, res: Response): Promise<void> {
    try {
      const volumeData = await DataController.getVolumeForPeriod(24);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...volumeData,
          period: '1day'
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 1day swap volume:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 1day swap volume'
      };
      res.status(500).json(response);
    }
  }

  static async getSwapVolume1week(req: Request, res: Response): Promise<void> {
    try {
      const volumeData = await DataController.getVolumeForPeriod(7 * 24);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...volumeData,
          period: '1week'
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 1week swap volume:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 1week swap volume'
      };
      res.status(500).json(response);
    }
  }

  static async getSwapVolume1month(req: Request, res: Response): Promise<void> {
    try {
      const volumeData = await DataController.getVolumeForPeriod(30 * 24);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...volumeData,
          period: '1month'
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 1month swap volume:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 1month swap volume'
      };
      res.status(500).json(response);
    }
  }

  private static async getChartPricesWithParams(
    bucketInterval: string, 
    timeInterval: string, 
    periodLabel: string, 
    intervalLabel: string
  ): Promise<any> {
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

    return {
      prices: result.rows,
      period: periodLabel,
      interval: intervalLabel
    };
  }

  static async getChartPrices(req: Request, res: Response): Promise<void> {
    try {
      const data = await DataController.getChartPricesWithParams(
        '1 minute', 
        '24 hours', 
        '24 hours', 
        '1 minute'
      );

      const response: ApiResponse = {
        success: true,
        data
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

  // 1m: 1 minute intervals, 24h period
  static async getChartPrices1m(req: Request, res: Response): Promise<void> {
    try {
      const data = await DataController.getChartPricesWithParams(
        '1 minute', 
        '24 hours', 
        '24 hours', 
        '1 minute'
      );

      const response: ApiResponse = {
        success: true,
        data
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 1m chart prices:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 1m chart prices'
      };
      res.status(500).json(response);
    }
  }

  // 1h: 1 hour intervals, 7 days period
  static async getChartPrices1h(req: Request, res: Response): Promise<void> {
    try {
      const data = await DataController.getChartPricesWithParams(
        '1 hour', 
        '7 days', 
        '7 days', 
        '1 hour'
      );

      const response: ApiResponse = {
        success: true,
        data
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 1h chart prices:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 1h chart prices'
      };
      res.status(500).json(response);
    }
  }

  // 1d: 1 day intervals, 30 days period
  static async getChartPrices1d(req: Request, res: Response): Promise<void> {
    try {
      const data = await DataController.getChartPricesWithParams(
        '1 day', 
        '30 days', 
        '30 days', 
        '1 day'
      );

      const response: ApiResponse = {
        success: true,
        data
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 1d chart prices:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 1d chart prices'
      };
      res.status(500).json(response);
    }
  }

  static async getFeePaid(req: Request, res: Response): Promise<void> {
    try {
      const cacheKey = 'fee_paid_all';
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
      const timestamps = {
        hour24: now - day,
        week1: now - (7 * day),
        month1: now - (30 * day)
      };

      const result = await pool.query(`
        SELECT 
          -- 24hr fee paid
          SUM(CASE WHEN timestamp > to_timestamp($1) THEN fee_paid0::numeric ELSE 0 END) as fee_paid0_24hr,
          SUM(CASE WHEN timestamp > to_timestamp($1) THEN fee_paid1::numeric ELSE 0 END) as fee_paid1_24hr,
          
          -- 1 week fee paid
          SUM(CASE WHEN timestamp > to_timestamp($2) THEN fee_paid0::numeric ELSE 0 END) as fee_paid0_1week,
          SUM(CASE WHEN timestamp > to_timestamp($2) THEN fee_paid1::numeric ELSE 0 END) as fee_paid1_1week,
          
          -- 1 month fee paid
          SUM(CASE WHEN timestamp > to_timestamp($3) THEN fee_paid0::numeric ELSE 0 END) as fee_paid0_1month,
          SUM(CASE WHEN timestamp > to_timestamp($3) THEN fee_paid1::numeric ELSE 0 END) as fee_paid1_1month
        FROM swaps 
        WHERE timestamp IS NOT NULL AND fee_paid0 IS NOT NULL AND fee_paid1 IS NOT NULL
      `, [timestamps.hour24, timestamps.week1, timestamps.month1]);

      const row = result.rows[0];
      const feeData = {
        '24hr': {
          fee_paid0: row.fee_paid0_24hr || '0',
          fee_paid1: row.fee_paid1_24hr || '0'
        },
        '1week': {
          fee_paid0: row.fee_paid0_1week || '0',
          fee_paid1: row.fee_paid1_1week || '0'
        },
        '1month': {
          fee_paid0: row.fee_paid0_1month || '0',
          fee_paid1: row.fee_paid1_1month || '0'
        }
      };

      cache.set(cacheKey, feeData, 15 * 1000);
    
      const response: ApiResponse = {
        success: true,
        data: feeData
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

  private static async getFeePaidForPeriod(hours: number): Promise<{ fee_paid0: string, fee_paid1: string }> {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = now - (hours * 60 * 60);
    
    const result = await pool.query(`
      SELECT 
        SUM(fee_paid0::numeric) as total_fee_paid0,
        SUM(fee_paid1::numeric) as total_fee_paid1
      FROM swaps 
      WHERE timestamp > to_timestamp($1) AND fee_paid0 IS NOT NULL AND fee_paid1 IS NOT NULL
    `, [timestamp]);

    return {
      fee_paid0: result.rows[0].total_fee_paid0 || '0',
      fee_paid1: result.rows[0].total_fee_paid1 || '0'
    };
  }

  static async getFeePaid24hr(req: Request, res: Response): Promise<void> {
    try {
      const feeData = await DataController.getFeePaidForPeriod(24);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...feeData,
          period: '24hr'
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 24hr fee paid:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 24hr fee paid'
      };
      res.status(500).json(response);
    }
  }

  static async getFeePaid1week(req: Request, res: Response): Promise<void> {
    try {
      const feeData = await DataController.getFeePaidForPeriod(7 * 24);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...feeData,
          period: '1week'
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 1week fee paid:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 1week fee paid'
      };
      res.status(500).json(response);
    }
  }

  static async getFeePaid1month(req: Request, res: Response): Promise<void> {
    try {
      const feeData = await DataController.getFeePaidForPeriod(30 * 24);
      
      const response: ApiResponse = {
        success: true,
        data: {
          ...feeData,
          period: '1month'
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching 1month fee paid:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch 1month fee paid'
      };
      res.status(500).json(response);
    }
  }

  // New endpoint to get total fees by token type
  static async getTotalFees(req: Request, res: Response): Promise<void> {
    try {
      const result = await pool.query(`
        SELECT 
          SUM(fee_paid0::numeric) as total_fee_paid0,
          SUM(fee_paid1::numeric) as total_fee_paid1,
          COUNT(*) as total_swaps
        FROM swaps 
        WHERE fee_paid0 IS NOT NULL AND fee_paid1 IS NOT NULL
      `);

      const row = result.rows[0];
      const feeData = {
        total_fee_paid0: row.total_fee_paid0 || '0',
        total_fee_paid1: row.total_fee_paid1 || '0',
        total_swaps: parseInt(row.total_swaps) || 0
      };

      const response: ApiResponse = {
        success: true,
        data: feeData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching total fees:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch total fees'
      };
      res.status(500).json(response);
    }
  }

}
