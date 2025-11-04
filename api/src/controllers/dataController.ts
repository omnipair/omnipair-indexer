import { Request, Response } from 'express';
import pool from '../config/database';
import { ApiResponse, Swap, UserHistory } from '../types';
import { cache } from '../utils/cache';
import { calculateEmaFromPoolData, fromNad, toNad } from '../utils/emaCalculator';
import { PublicKey } from '@solana/web3.js';
import { PairStateService, PairState } from '../services/PairStateService';
import path from 'path';

export class DataController {
  // Singleton instance for PairStateService
  private static pairStateService: PairStateService | null = null;

  // Initialize PairStateService once
  private static async initializePairStateService(): Promise<PairStateService> {
    if (DataController.pairStateService) {
      return DataController.pairStateService;
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const service = new PairStateService(rpcUrl);
    
    try {
      // Load IDL
      const idlPath = path.join(__dirname, '../idl/omnipair.mainnet.json');
      const idl = require(idlPath);
      service.initializeProgram(idl);
      
      DataController.pairStateService = service;
      return service;
    } catch (error) {
      console.error('Error initializing PairStateService:', error);
      throw error;
    }
  }

  // Helper function to calculate APR for a given pair address
  private static async calculateAPR(pairAddress: string): Promise<{
    apr: number;
    apr_breakdown: {
      token0_apr: number;
      token1_apr: number;
    };
  }> {
    const cacheKey = `apr_calc_${pairAddress}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }

    const now = Math.floor(Date.now() / 1000);
    const week = 7 * 24 * 60 * 60;

    // Get fees from the last 7 days and calculate average liquidity for the specific pair
    const result = await pool.query(`
      WITH weekly_stats AS (
        SELECT 
          SUM(fee_paid0::numeric) as weekly_fee0,
          SUM(fee_paid1::numeric) as weekly_fee1,
          AVG(reserve0::numeric) as avg_reserve0,
          AVG(reserve1::numeric) as avg_reserve1
        FROM swaps 
        WHERE timestamp > to_timestamp($1) 
          AND reserve0 > 0 
          AND reserve1 > 0
          AND pair = $2
      )
      SELECT 
        ws.weekly_fee0,
        ws.weekly_fee1,
        ws.avg_reserve0,
        ws.avg_reserve1
      FROM weekly_stats ws
    `, [now - week, pairAddress]);

    let aprData = {
      apr: 0,
      apr_breakdown: {
        token0_apr: 0,
        token1_apr: 0
      }
    };

    if (result.rows.length > 0) {
      const row = result.rows[0];
      const weeklyFee0 = parseFloat(row.weekly_fee0 || '0');
      const weeklyFee1 = parseFloat(row.weekly_fee1 || '0');
      const avgReserve0 = parseFloat(row.avg_reserve0 || '0');
      const avgReserve1 = parseFloat(row.avg_reserve1 || '0');

      const dailyFee0 = weeklyFee0 / 7;
      const dailyFee1 = weeklyFee1 / 7;
      const token0APR = avgReserve0 > 0 ? (dailyFee0 / (avgReserve0 * 2)) * 365 * 100 : 0;
      const token1APR = avgReserve1 > 0 ? (dailyFee1 / (avgReserve1 * 2)) * 365 * 100 : 0;

      aprData = {
        apr: (token0APR + token1APR) / 2,
        apr_breakdown: {
          token0_apr: token0APR,
          token1_apr: token1APR
        }
      };
    }

    // Cache for 5 minutes
    cache.set(cacheKey, aprData, 5 * 60 * 1000);
    
    return aprData;
  }

  // Helper function to calculate total fees paid for a given pair address and time period
  private static async calculateTotalFeesPaid(pairAddress: string, hours?: number): Promise<{
    total_fee_paid_in_token0: string;
    total_fee_paid_in_token1: string;
    period: string;
  }> {
    const cacheKey = `fees_calc_${pairAddress}_${hours ? `${hours}hrs` : 'all'}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }

    let query: string;
    let queryParams: any[];
    let period: string;

    if (hours !== undefined && hours !== null) {
      // Time-limited query
      const now = Math.floor(Date.now() / 1000);
      const timestamp = now - (hours * 60 * 60);
      
      query = `
        SELECT 
          SUM(fee_paid0::numeric) as total_fee_paid0,
          SUM(fee_paid1::numeric) as total_fee_paid1
        FROM swaps 
        WHERE timestamp > to_timestamp($1) AND pair = $2
      `;
      queryParams = [timestamp, pairAddress];
      period = hours === 24 ? '24hrs' : `${hours}hrs`;
    } else {
      // No time limit - get all fees
      query = `
        SELECT 
          SUM(fee_paid0::numeric) as total_fee_paid0,
          SUM(fee_paid1::numeric) as total_fee_paid1
        FROM swaps 
        WHERE pair = $1
      `;
      queryParams = [pairAddress];
      period = 'all';
    }
    
    const result = await pool.query(query, queryParams);

    const feesData = {
      total_fee_paid_in_token0: result.rows[0].total_fee_paid0 || '0',
      total_fee_paid_in_token1: result.rows[0].total_fee_paid1 || '0',
      period
    };

    // Cache for 1 minute
    cache.set(cacheKey, feesData, 1 * 60 * 1000);

    return feesData;
  }

  private static async fetchCachedPairState(
    pairService: PairStateService,
    token0Address: string,
    token1Address: string
  ): Promise<PairState> {
    const cacheKey = `pair_state_${token0Address}_${token1Address}`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const pairState = await pairService.fetchPairState(
      new PublicKey(token0Address),
      new PublicKey(token1Address)
    );

    // Cache for 10 minutes
    cache.set(cacheKey, pairState, 10 * 60 * 1000);

    return pairState;
  }

  private static async calculateSwapVolume(pairAddress: string, hours: number = 24): Promise<{
    volume0: string;
    volume1: string;
    period: string;
  }> {
    const cacheKey = `swap_volume_calc_${pairAddress}_${hours}hrs`;
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    const now = Math.floor(Date.now() / 1000);
    const timestamp = now - (hours * 60 * 60);

    const result = await pool.query(`
      SELECT 
        SUM(CASE WHEN is_token0_in = true THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume0,
        SUM(CASE WHEN is_token0_in = false THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume1
      FROM swaps 
      WHERE timestamp > to_timestamp($1) AND pair = $2
    `, [timestamp, pairAddress]);

    const volumeData = {
      volume0: result.rows[0].total_volume0 || '0',
      volume1: result.rows[0].total_volume1 || '0',
      period: `${hours}hrs`
    };

    // Cache for 1 minute
    cache.set(cacheKey, volumeData, 1 * 60 * 1000);

    return volumeData;
  }

  static async getSwaps(req: Request, res: Response): Promise<void> {
    try {
      const pairAddress = req.params.pairAddress;
      const userAddress = req.params.address || req.params.userAddress; // Support both parameter names
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000); 
      const offset = parseInt(req.query.offset as string) || 0;

      // Validate that at least one filter is provided
      if (!pairAddress && !userAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'Either pair address or user address is required'
        };
        res.status(400).json(response);
        return;
      }

      // Build query based on available parameters
      let countQuery: string;
      let dataQuery: string;
      let queryParams: any[];
      let countParams: any[];

      if (pairAddress && userAddress) {
        // Filter by both pair and user address
        countQuery = 'SELECT COUNT(*) FROM swaps WHERE pair = $1 AND user_address = $2';
        dataQuery = 'SELECT * FROM swaps WHERE pair = $1 AND user_address = $2 ORDER BY id DESC LIMIT $3 OFFSET $4';
        queryParams = [pairAddress, userAddress, limit, offset];
        countParams = [pairAddress, userAddress];
      } else if (pairAddress) {
        // Filter by pair only
        countQuery = 'SELECT COUNT(*) FROM swaps WHERE pair = $1';
        dataQuery = 'SELECT * FROM swaps WHERE pair = $1 ORDER BY id DESC LIMIT $2 OFFSET $3';
        queryParams = [pairAddress, limit, offset];
        countParams = [pairAddress];
      } else {
        // Filter by user only
        countQuery = 'SELECT COUNT(*) FROM swaps WHERE user_address = $1';
        dataQuery = 'SELECT * FROM swaps WHERE user_address = $1 ORDER BY id DESC LIMIT $2 OFFSET $3';
        queryParams = [userAddress, limit, offset];
        countParams = [userAddress];
      }

      const countResult = await pool.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);
      
      const result = await pool.query(dataQuery, queryParams);
      
      // Build response data dynamically based on what filters were used
      const responseData: any = {
        swaps: result.rows,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasNext: offset + limit < totalCount
        }
      };

      if (pairAddress) responseData.pairAddress = pairAddress;
      if (userAddress) responseData.userAddress = userAddress;

      const response: ApiResponse = {
        success: true,
        data: responseData
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
      const pairAddress = req.params.pairAddress;
      const hours = req.params.hours ? parseInt(req.params.hours) : 24;

      // Validate pair address
      if (!pairAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'Pair address is required'
        };
        res.status(400).json(response);
        return;
      }
      
      if (isNaN(hours) || hours <= 0) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid hours parameter. Must be a positive number.'
        };
        res.status(400).json(response);
        return;
      }

      const cacheKey = `swap_volume_${pairAddress}_${hours}hrs`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      // Calculate volume for the specified period and pair
      const now = Math.floor(Date.now() / 1000);
      const timestamp = now - (hours * 60 * 60);
      
      const result = await pool.query(`
        SELECT 
          SUM(CASE WHEN is_token0_in = true THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume0,
          SUM(CASE WHEN is_token0_in = false THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume1
        FROM swaps 
        WHERE timestamp > to_timestamp($1) AND pair = $2
      `, [timestamp, pairAddress]);

      const volumeData = {
        volume0: result.rows[0].total_volume0 || '0',
        volume1: result.rows[0].total_volume1 || '0'
      };
      
      const responseData = {
        ...volumeData,
        period: `${hours}hrs`,
        hours: hours,
        pairAddress
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
      const pairAddress = req.params.pairAddress;
      const hours = req.params.hours ? parseInt(req.params.hours) : 24;

      // Validate pair address
      if (!pairAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'Pair address is required'
        };
        res.status(400).json(response);
        return;
      }
      
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

      // Get chart prices for the specified period and pair
      const timeInterval = `${hours} hours`;
      const result = await pool.query(`
        SELECT
          time_bucket_gapfill($1, timestamp,
            start => now() - interval '${timeInterval}',
            finish => now()
          ) AS bucket,
          LOCF(AVG(reserve1::numeric / NULLIF(reserve0,0))) AS avg_price
        FROM swaps
        WHERE timestamp >= now() - interval '${timeInterval}' AND pair = $2
        GROUP BY bucket
        ORDER BY bucket
      `, [bucketInterval, pairAddress]);

      // Get the latest price from the most recent swap
      const latestPriceResult = await pool.query(`
        SELECT reserve1::numeric / NULLIF(reserve0,0) AS latest_price
        FROM swaps
        WHERE pair = $1
        ORDER BY timestamp DESC
        LIMIT 1
      `, [pairAddress]);

      const data = {
        prices: result.rows,
        latestPrice: latestPriceResult.rows[0]?.latest_price || null,
        period: `${hours} hours`,
        interval: intervalLabel,
        hours: hours,
        pairAddress
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
      const pairAddress = req.params.pairAddress;
      const hours = req.params.hours ? parseInt(req.params.hours) : 24;

      // Validate pair address
      if (!pairAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'Pair address is required'
        };
        res.status(400).json(response);
        return;
      }
      
      if (isNaN(hours) || hours <= 0) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid hours parameter. Must be a positive number.'
        };
        res.status(400).json(response);
        return;
      }

      const cacheKey = `fee_paid_${pairAddress}_${hours}hrs`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      const feeData = await DataController.calculateTotalFeesPaid(pairAddress, hours);
      const responseData = {
        ...feeData,
        hours: hours,
        pairAddress
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
      const pairAddress = req.params.pairAddress;

      // Validate pair address
      if (!pairAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'Pair address is required'
        };
        res.status(400).json(response);
        return;
      }

      const cacheKey = `apr_data_${pairAddress}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      const aprData = await DataController.calculateAPR(pairAddress);
      const responseData = {
        ...aprData,
        pairAddress
      };

      // Cache for 15 seconds
      cache.set(cacheKey, responseData, 15 * 1000);

      const response: ApiResponse = {
        success: true,
        data: responseData
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

  static async getPoolInfo(req: Request, res: Response): Promise<void> {
    try {
      const pairAddress = req.params.pairAddress;

      if (!pairAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'Pair address is required'
        };
        res.status(400).json(response);
        return;
      }

      const cacheKey = `pool_info_${pairAddress}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      // Get latest swap data for reserves
      const swapResult = await pool.query(`
        SELECT reserve0, reserve1, timestamp, ema_price
        FROM swaps 
        WHERE pair = $1
        ORDER BY id DESC
        LIMIT 2
      `, [pairAddress]);

      if (swapResult.rows.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: 'No swap data found for this pair address'
        };
        res.status(404).json(response);
        return;
      }

      const reserve0 = parseFloat(swapResult.rows[0].reserve0);
      const reserve1 = parseFloat(swapResult.rows[0].reserve1);

      let currentEmaPrice0: number | null = null;
      let currentEmaPrice1: number | null = null;
      
      if (swapResult.rows.length > 1 && swapResult.rows[1].ema_price) {
        console.log('Calculating EMA prices using the latest swap data');
        // Calculate current EMA prices using the latest swap data
        const lastPrice0Ema = parseFloat(swapResult.rows[1].ema_price);
        const lastPrice1Ema = parseFloat(swapResult.rows[1].ema_price);
        const lastUpdate = Math.floor(new Date(swapResult.rows[1].timestamp).getTime() / 1000);
        
        const emaResult = calculateEmaFromPoolData(reserve0, reserve1, lastPrice0Ema, lastPrice1Ema, lastUpdate);
        
        currentEmaPrice0 = fromNad(emaResult.price0Ema);
        currentEmaPrice1 = fromNad(emaResult.price1Ema);
      } else {
        console.log('No EMA prices found, using current spot prices');
        console.log(swapResult.rows)
      }
      
      const poolData = {
        price0: reserve1 / reserve0,
        price1: reserve0 / reserve1,
        emaPrice0: currentEmaPrice0 !== undefined ? currentEmaPrice0 : reserve1 / reserve0,
        emaPrice1: currentEmaPrice1 !== undefined ? currentEmaPrice1 : reserve0 / reserve1,
        reserve0: reserve0,
        reserve1: reserve1,
        timestamp: new Date(swapResult.rows[0].timestamp).toISOString().replace('T', ' ').replace('Z', '+00'),
        pairAddress
      };

      cache.set(cacheKey, poolData, 5 * 1000);

      const response: ApiResponse = {
        success: true,
        data: poolData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching pool info:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch pool info'
      };
      res.status(500).json(response);
    }
  }

  static async getPools(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const offset = parseInt(req.query.offset as string) || 0;

      // Get total count of pools
      const countResult = await pool.query('SELECT COUNT(*) FROM pools');
      const totalCount = parseInt(countResult.rows[0].count);

      // Get pools with pagination
      const result = await pool.query(`
        SELECT id, pair_address, token0, token1 
        FROM pools 
        ORDER BY id ASC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      // Initialize PairStateService
      const pairService = await DataController.initializePairStateService();

      // Calculate APR, total fees paid, and fetch pair state for each pool
      const poolsWithData = await Promise.all(
        result.rows.map(async (poolData) => {
          const pairAddress = poolData.pair_address;
          const token0Address = poolData.token0;
          const token1Address = poolData.token1;
          
          try {
           // Fetch pair state, APR, total fees paid, and 24h swap volume in parallel
           const [pairState, aprData, feesData, volumeData] = await Promise.all([
              DataController.fetchCachedPairState(
                pairService,
                token0Address,
                token1Address
              ),
              DataController.calculateAPR(pairAddress),
              DataController.calculateTotalFeesPaid(pairAddress),
              DataController.calculateSwapVolume(pairAddress)
            ]);

            return {
              id: poolData.id,
              pair_address: pairAddress,
              // Token 0 metadata
              token0: {
                symbol: pairState.token0.symbol,
                name: pairState.token0.name,
                decimals: pairState.token0.decimals,
                address: pairState.token0.address,
                icon: pairState.token0.iconUrl || null
              },
              // Token 1 metadata
              token1: {
                symbol: pairState.token1.symbol,
                name: pairState.token1.name,
                decimals: pairState.token1.decimals,
                address: pairState.token1.address,
                icon: pairState.token1.iconUrl || null
              },
              // Reserves
              reserves: {
                token0: pairState.reserves.token0,
                token1: pairState.reserves.token1
              },
              // Oracle prices (EMA)
              oracle_prices: {
                token0: pairState.oraclePrices.token0,
                token1: pairState.oraclePrices.token1
              },
              // Spot prices
              spot_prices: {
                token0: pairState.spotPrices.token0,
                token1: pairState.spotPrices.token1
              },
              // Interest rates
              interest_rates: {
                token0: pairState.rates.token0,
                token1: pairState.rates.token1
              },
              // Total debts
              total_debts: {
                token0: pairState.totalDebts.token0,
                token1: pairState.totalDebts.token1
              },
              // Utilization
              utilization: {
                token0: pairState.utilization.token0,
                token1: pairState.utilization.token1
              },
              // LP token info
              lp_token: {
                total_supply: pairState.totalSupply,
                decimals: pairState.lpTokenDecimals
              },
              // APR and fees
              apr: aprData,
              total_fees_paid: feesData,
              // 24h swap volume
              volume_24h: volumeData
            };
          } catch (error) {
            console.error(`Error fetching data for pool ${pairAddress}:`, error);
            // Return basic data with defaults if pair state fetch fails
            return {
              id: poolData.id,
              pair_address: pairAddress,
              token0: {
                symbol: 'Unknown',
                name: 'Unknown',
                decimals: 0,
                address: token0Address,
                icon: null
              },
              token1: {
                symbol: 'Unknown',
                name: 'Unknown',
                decimals: 0,
                address: token1Address,
                icon: null
              },
              reserves: {
                token0: '0',
                token1: '0'
              },
              oracle_prices: {
                token0: '0',
                token1: '0'
              },
              spot_prices: {
                token0: '0',
                token1: '0'
              },
              interest_rates: {
                token0: 0,
                token1: 0
              },
              total_debts: {
                token0: '0',
                token1: '0'
              },
              utilization: {
                token0: 0,
                token1: 0
              },
              lp_token: {
                total_supply: '0',
                decimals: 0
              },
              apr: {
                apr: 0,
                apr_breakdown: {
                  token0_apr: 0,
                  token1_apr: 0
                }
              },
              total_fees_paid: {
                total_fee_paid_in_token0: '0',
                total_fee_paid_in_token1: '0',
                period: 'all'
              },
              swap_volume_24h: {
                volume0: '0',
                volume1: '0',
                period: '24hrs'
              }
            };
          }
        })
      );

      const responseData = {
        pools: poolsWithData,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasNext: offset + limit < totalCount
        }
      };

      const response: ApiResponse = {
        success: true,
        data: responseData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching pools:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch pools'
      };
      res.status(500).json(response);
    }
  }

  static async getUserHistory(req: Request, res: Response): Promise<void> {
    try {
      const userAddress = req.params.userAddress;
      const pair = req.params.pair;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = req.query.sortBy as string || 'timestamp';
      const sortOrder = req.query.sortOrder as string || 'desc';

      // Validate required parameters
      if (!userAddress || !pair) {
        const response: ApiResponse = {
          success: false,
          error: 'Both user_address and pair are required'
        };
        res.status(400).json(response);
        return;
      }

      // Validate sort parameters
      const allowedSortFields = ['id', 'timestamp', 'amount0', 'amount1', 'liquidity'];
      if (!allowedSortFields.includes(sortBy)) {
        const response: ApiResponse = {
          success: false,
          error: `Invalid sortBy field. Allowed fields: ${allowedSortFields.join(', ')}`
        };
        res.status(400).json(response);
        return;
      }

      if (!['asc', 'desc'].includes(sortOrder.toLowerCase())) {
        const response: ApiResponse = {
          success: false,
          error: 'Invalid sortOrder. Must be "asc" or "desc"'
        };
        res.status(400).json(response);
        return;
      }

      // Build count query
      const countQuery = 'SELECT COUNT(*) FROM adjust_liquidity WHERE user_address = $1 AND pair = $2';
      const countResult = await pool.query(countQuery, [userAddress, pair]);
      const totalCount = parseInt(countResult.rows[0].count);

      // Build data query with sorting and join with pools table
      const dataQuery = `
        SELECT 
          al.*,
          p.token0,
          p.token1
        FROM adjust_liquidity al
        LEFT JOIN pools p ON al.pair = p.pair_address
        WHERE al.user_address = $1 AND al.pair = $2 
        ORDER BY al.${sortBy} ${sortOrder.toUpperCase()} 
        LIMIT $3 OFFSET $4
      `;
      const result = await pool.query(dataQuery, [userAddress, pair, limit, offset]);

      const transformedHistory = result.rows.map(row => {
        const { token0, token1, ...rest } = row;
        return {
          ...rest,
          pair: {
            address: row.pair,
            token0: token0,
            token1: token1
          }
        };
      });

      const responseData = {
        userHistory: transformedHistory,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasNext: offset + limit < totalCount
        },
        filters: {
          userAddress,
          pair,
          sortBy,
          sortOrder: sortOrder.toLowerCase()
        }
      };

      const response: ApiResponse = {
        success: true,
        data: responseData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching user history:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch user history data'
      };
      res.status(500).json(response);
    }
  }

  static async getUserPositions(req: Request, res: Response): Promise<void> {
    try {
      const userAddress = req.params.userAddress;

      // Validate required parameters
      if (!userAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'User address is required'
        };
        res.status(400).json(response);
        return;
      }

      const cacheKey = `user_positions_${userAddress}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      // Query to get the latest unique position for each position address
      const result = await pool.query(`
        SELECT 
          pair,
          position,
          collateral0,
          collateral1,
          debt0_shares,
          debt1_shares,
          collateral0_applied_min_cf_bps,
          collateral1_applied_min_cf_bps,
          event_timestamp
        FROM user_position_updated_events upu1
        WHERE signer = $1
          AND event_timestamp = (
            SELECT MAX(event_timestamp)
            FROM user_position_updated_events upu2
            WHERE upu2.position = upu1.position
              AND upu2.signer = $1
          )
        ORDER BY event_timestamp DESC
      `, [userAddress]);

      const positions = result.rows.map(row => ({
        pair: row.pair,
        position: row.position,
        collateral0: row.collateral0,
        collateral1: row.collateral1,
        debt0_shares: row.debt0_shares,
        debt1_shares: row.debt1_shares,
        collateral0_applied_min_cf_bps: row.collateral0_applied_min_cf_bps,
        collateral1_applied_min_cf_bps: row.collateral1_applied_min_cf_bps,
        event_timestamp: row.event_timestamp
      }));

      const responseData = {
        positions,
        userAddress,
        totalPositions: positions.length
      };

      // Cache for 15 seconds
      cache.set(cacheKey, responseData, 15 * 1000);

      const response: ApiResponse = {
        success: true,
        data: responseData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching user positions:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch user positions'
      };
      res.status(500).json(response);
    }
  }

  static async getAllPositions(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const offset = parseInt(req.query.offset as string) || 0;

      const cacheKey = `all_positions_${limit}_${offset}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      // Get total count of unique positions
      const countResult = await pool.query(`
        SELECT COUNT(DISTINCT position) as total_count
        FROM user_position_updated_events
      `);
      const totalCount = parseInt(countResult.rows[0].total_count);

      // Query to get all unique positions with latest data
      const result = await pool.query(`
        SELECT 
          signer,
          pair,
          position,
          collateral0,
          collateral1,
          debt0_shares,
          debt1_shares,
          collateral0_applied_min_cf_bps,
          collateral1_applied_min_cf_bps,
          event_timestamp
        FROM user_position_updated_events upu1
        WHERE event_timestamp = (
          SELECT MAX(event_timestamp)
          FROM user_position_updated_events upu2
          WHERE upu2.position = upu1.position
        )
        ORDER BY event_timestamp DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const positions = result.rows.map(row => ({
        signer: row.signer,
        pair: row.pair,
        position: row.position,
        collateral0: row.collateral0,
        collateral1: row.collateral1,
        debt0_shares: row.debt0_shares,
        debt1_shares: row.debt1_shares,
        collateral0_applied_min_cf_bps: row.collateral0_applied_min_cf_bps,
        collateral1_applied_min_cf_bps: row.collateral1_applied_min_cf_bps,
        event_timestamp: row.event_timestamp
      }));

      const responseData = {
        positions,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasNext: offset + limit < totalCount
        }
      };

      // Cache for 15 seconds
      cache.set(cacheKey, responseData, 15 * 1000);

      const response: ApiResponse = {
        success: true,
        data: responseData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching all positions:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch all positions'
      };
      res.status(500).json(response);
    }
  }

  static async getUserLendingHistory(req: Request, res: Response): Promise<void> {
    try {
      const userAddress = req.params.userAddress;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
      const offset = parseInt(req.query.offset as string) || 0;

      // Validate required parameters
      if (!userAddress) {
        const response: ApiResponse = {
          success: false,
          error: 'User address is required'
        };
        res.status(400).json(response);
        return;
      }

      const cacheKey = `user_lending_history_${userAddress}_${limit}_${offset}`;
      const cachedData = cache.get(cacheKey);
      
      if (cachedData) {
        const response: ApiResponse = {
          success: true,
          data: cachedData
        };
        res.json(response);
        return;
      }

      // Get total count of all lending events for the user
      const countResult = await pool.query(`
        SELECT 
          (
            (SELECT COUNT(*) FROM adjust_collateral_events WHERE signer = $1) +
            (SELECT COUNT(*) FROM adjust_debt_events WHERE signer = $1) +
            (SELECT COUNT(*) FROM user_position_liquidated_events WHERE signer = $1) +
            (SELECT COUNT(*) FROM user_position_updated_events WHERE signer = $1)
          ) as total_count
      `, [userAddress]);
      const totalCount = parseInt(countResult.rows[0].total_count);

      // Union all lending-related events with type identification
      const result = await pool.query(`
        SELECT * FROM (
          SELECT 
            'collateral_adjustment' as event_type,
            id,
            pair,
            signer,
            amount0::bigint,
            amount1::bigint,
            NULL::text as position,
            NULL::text as liquidator,
            NULL::bigint as collateral0_liquidated,
            NULL::bigint as collateral1_liquidated,
            NULL::bigint as debt0_liquidated,
            NULL::bigint as debt1_liquidated,
            NULL::bigint as collateral_price,
            NULL::numeric as shortfall,
            NULL::bigint as liquidation_bonus_applied,
            NULL::numeric as k0,
            NULL::numeric as k1,
            NULL::bigint as collateral0,
            NULL::bigint as collateral1,
            NULL::bigint as debt0_shares,
            NULL::bigint as debt1_shares,
            NULL::integer as collateral0_applied_min_cf_bps,
            NULL::integer as collateral1_applied_min_cf_bps,
            transaction_signature,
            slot,
            event_timestamp
          FROM adjust_collateral_events 
          WHERE signer = $1
          
          UNION ALL
          
          SELECT 
            'debt_adjustment' as event_type,
            id,
            pair,
            signer,
            amount0::bigint,
            amount1::bigint,
            NULL::text as position,
            NULL::text as liquidator,
            NULL::bigint as collateral0_liquidated,
            NULL::bigint as collateral1_liquidated,
            NULL::bigint as debt0_liquidated,
            NULL::bigint as debt1_liquidated,
            NULL::bigint as collateral_price,
            NULL::numeric as shortfall,
            NULL::bigint as liquidation_bonus_applied,
            NULL::numeric as k0,
            NULL::numeric as k1,
            NULL::bigint as collateral0,
            NULL::bigint as collateral1,
            NULL::bigint as debt0_shares,
            NULL::bigint as debt1_shares,
            NULL::integer as collateral0_applied_min_cf_bps,
            NULL::integer as collateral1_applied_min_cf_bps,
            transaction_signature,
            slot,
            event_timestamp
          FROM adjust_debt_events 
          WHERE signer = $1
          
          UNION ALL
          
          SELECT 
            'liquidation' as event_type,
            id,
            pair,
            signer,
            NULL::bigint as amount0,
            NULL::bigint as amount1,
            position::text,
            liquidator::text,
            collateral0_liquidated::bigint,
            collateral1_liquidated::bigint,
            debt0_liquidated::bigint,
            debt1_liquidated::bigint,
            collateral_price::bigint,
            shortfall::numeric,
            liquidation_bonus_applied::bigint,
            k0::numeric,
            k1::numeric,
            NULL::bigint as collateral0,
            NULL::bigint as collateral1,
            NULL::bigint as debt0_shares,
            NULL::bigint as debt1_shares,
            NULL::integer as collateral0_applied_min_cf_bps,
            NULL::integer as collateral1_applied_min_cf_bps,
            transaction_signature,
            slot,
            event_timestamp
          FROM user_position_liquidated_events 
          WHERE signer = $1
          
          UNION ALL
          
          SELECT 
            'position_update' as event_type,
            id,
            pair,
            signer,
            NULL::bigint as amount0,
            NULL::bigint as amount1,
            position::text,
            NULL::text as liquidator,
            NULL::bigint as collateral0_liquidated,
            NULL::bigint as collateral1_liquidated,
            NULL::bigint as debt0_liquidated,
            NULL::bigint as debt1_liquidated,
            NULL::bigint as collateral_price,
            NULL::numeric as shortfall,
            NULL::bigint as liquidation_bonus_applied,
            NULL::numeric as k0,
            NULL::numeric as k1,
            collateral0::bigint,
            collateral1::bigint,
            debt0_shares::bigint,
            debt1_shares::bigint,
            collateral0_applied_min_cf_bps::integer,
            collateral1_applied_min_cf_bps::integer,
            transaction_signature,
            slot,
            event_timestamp
          FROM user_position_updated_events 
          WHERE signer = $1
        ) AS combined_events
        ORDER BY event_timestamp DESC, id DESC
        LIMIT $2 OFFSET $3
      `, [userAddress, limit, offset]);

      // Transform the results to include relevant fields based on event type
      const lendingHistory = result.rows.map(row => {
        const baseEvent = {
          id: row.id,
          event_type: row.event_type,
          pair: row.pair,
          signer: row.signer,
          transaction_signature: row.transaction_signature,
          slot: row.slot,
          event_timestamp: row.event_timestamp
        };

        switch (row.event_type) {
          case 'collateral_adjustment':
            return {
              ...baseEvent,
              amount0: row.amount0,
              amount1: row.amount1,
              description: 'Collateral adjustment'
            };
          
          case 'debt_adjustment':
            return {
              ...baseEvent,
              amount0: row.amount0,
              amount1: row.amount1,
              description: 'Debt adjustment'
            };
          
          case 'liquidation':
            return {
              ...baseEvent,
              position: row.position,
              liquidator: row.liquidator,
              collateral0_liquidated: row.collateral0_liquidated,
              collateral1_liquidated: row.collateral1_liquidated,
              debt0_liquidated: row.debt0_liquidated,
              debt1_liquidated: row.debt1_liquidated,
              collateral_price: row.collateral_price,
              shortfall: row.shortfall,
              liquidation_bonus_applied: row.liquidation_bonus_applied,
              k0: row.k0,
              k1: row.k1,
              description: 'Position liquidated'
            };
          
          case 'position_update':
            return {
              ...baseEvent,
              position: row.position,
              collateral0: row.collateral0,
              collateral1: row.collateral1,
              debt0_shares: row.debt0_shares,
              debt1_shares: row.debt1_shares,
              collateral0_applied_min_cf_bps: row.collateral0_applied_min_cf_bps,
              collateral1_applied_min_cf_bps: row.collateral1_applied_min_cf_bps,
              description: 'Position updated'
            };
          
          default:
            return baseEvent;
        }
      });

      const responseData = {
        lendingHistory,
        userAddress,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasNext: offset + limit < totalCount
        }
      };

      // Cache for 30 seconds
      cache.set(cacheKey, responseData, 30 * 1000);

      const response: ApiResponse = {
        success: true,
        data: responseData
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching user lending history:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch user lending history'
      };
      res.status(500).json(response);
    }
  }
}
