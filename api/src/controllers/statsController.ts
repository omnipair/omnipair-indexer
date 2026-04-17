import { Request, Response } from 'express';
import pool from '../config/database';
import { cache } from '../utils/cache';
import { PoolController } from './poolController';
import { fetchTokenPrices } from '../services/jupiterPriceService';

export class StatsController {
  static async getStats(_req: Request, res: Response): Promise<void> {
    try {
      const [tvlData, volumeData, feesData, interestData, swapCountData] = await Promise.all([
        StatsController.computeTvlAndCollateral(),
        StatsController.computeVolume(),
        StatsController.computeFees(),
        StatsController.computeInterest(),
        StatsController.computeSwapCount(),
      ]);

      res.json({
        success: true,
        data: {
          tvl: tvlData.tvl,
          liquidity_tvl: tvlData.liquidityTvl,
          total_collateral_deposited: tvlData.totalCollateralDeposited,
          total_volume: volumeData.totalVolume,
          volume_24h: volumeData.volume24h,
          pool_count: tvlData.poolCount,
          total_fees: feesData.totalFees,
          fees_24h: feesData.fees24h,
          total_lp_fees: feesData.totalLpFees,
          lp_fees_24h: feesData.lpFees24h,
          total_protocol_fees: feesData.totalProtocolFees,
          protocol_fees_24h: feesData.protocolFees24h,
          interest: interestData,
          total_swaps: swapCountData.totalSwaps,
          swaps_24h: swapCountData.swaps24h,
        },
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch stats' });
    }
  }

  private static async computeTvlAndCollateral(): Promise<{
    tvl: number;
    liquidityTvl: number;
    totalCollateralDeposited: number;
    poolCount: number;
  }> {
    const allPools = await PoolController.fetchAllPools(false);

    const uniqueMints = new Set<string>();
    for (const p of allPools) {
      if (p.token0.address) uniqueMints.add(p.token0.address);
      if (p.token1.address) uniqueMints.add(p.token1.address);
    }

    const prices = await fetchTokenPrices(Array.from(uniqueMints));

    let liquidityTvl = 0;
    let totalCollateralDeposited = 0;
    for (const p of allPools) {
      const reserve0 = parseFloat(p.reserves.token0);
      const reserve1 = parseFloat(p.reserves.token1);
      const price0 = prices.get(p.token0.address)?.price;
      const price1 = prices.get(p.token1.address)?.price;

      if (price0 && price1) {
        liquidityTvl += reserve0 * price0 + reserve1 * price1;
      } else if (price0) {
        liquidityTvl += reserve0 * price0 * 2;
      } else if (price1) {
        liquidityTvl += reserve1 * price1 * 2;
      }

      const collateral0 = parseFloat(p.total_collaterals?.token0 || '0') / Math.pow(10, p.token0.decimals || 0);
      const collateral1 = parseFloat(p.total_collaterals?.token1 || '0') / Math.pow(10, p.token1.decimals || 0);

      if (price0) {
        totalCollateralDeposited += collateral0 * price0;
      }
      if (price1) {
        totalCollateralDeposited += collateral1 * price1;
      }
    }

    return {
      tvl: liquidityTvl + totalCollateralDeposited,
      liquidityTvl,
      totalCollateralDeposited,
      poolCount: allPools.length,
    };
  }

  static async getVolumeChart(req: Request, res: Response): Promise<void> {
    const VALID_TIMEFRAMES = ['7d', '30d', 'all'] as const;
    type Timeframe = typeof VALID_TIMEFRAMES[number];

    const timeframe = (req.query.timeframe as string) || '7d';
    if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
      res.status(400).json({ success: false, error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(', ')}` });
      return;
    }

    const intervalMap: Record<Timeframe, string | null> = {
      '7d': "7 days",
      '30d': "30 days",
      'all': null,
    };

    const interval = intervalMap[timeframe as Timeframe];

    try {
      const data = await cache.getOrSet(`stats:volume_chart_${timeframe}`, 60_000, async () => {
        const whereClause = interval ? `WHERE timestamp >= now() - interval '${interval}'` : '';
        const result = await pool.query(`
          SELECT
            date_trunc('day', timestamp) AS day,
            COALESCE(SUM(volume_usd), 0) AS volume
          FROM swaps
          ${whereClause}
          GROUP BY day
          ORDER BY day ASC
        `);

        return result.rows.map((r: any) => ({
          date: r.day.toISOString().slice(0, 10),
          volume: parseFloat(r.volume),
        }));
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching volume chart:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch volume chart' });
    }
  }

  static async getFeesChart(req: Request, res: Response): Promise<void> {
    const VALID_TIMEFRAMES = ['7d', '30d', 'all'] as const;
    type Timeframe = typeof VALID_TIMEFRAMES[number];

    const timeframe = (req.query.timeframe as string) || '7d';
    if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
      res.status(400).json({ success: false, error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(', ')}` });
      return;
    }

    const intervalMap: Record<Timeframe, string | null> = {
      '7d': "7 days",
      '30d': "30 days",
      'all': null,
    };

    const interval = intervalMap[timeframe as Timeframe];

    try {
      const data = await cache.getOrSet(`stats:fees_chart_${timeframe}`, 60_000, async () => {
        const whereClause = interval ? `WHERE timestamp >= now() - interval '${interval}'` : '';
        const result = await pool.query(`
          SELECT
            date_trunc('day', timestamp) AS day,
            COALESCE(SUM(lp_fee_usd), 0) AS lp_fees,
            COALESCE(SUM(protocol_fee_usd), 0) AS protocol_fees,
            COALESCE(SUM(COALESCE(lp_fee_usd, 0) + COALESCE(protocol_fee_usd, 0)), 0) AS total_fees
          FROM swaps
          ${whereClause}
          GROUP BY day
          ORDER BY day ASC
        `);

        return result.rows.map((r: any) => ({
          date: r.day.toISOString().slice(0, 10),
          totalFees: parseFloat(r.total_fees),
          protocolFees: parseFloat(r.protocol_fees),
          lpFees: parseFloat(r.lp_fees),
        }));
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching fees chart:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch fees chart' });
    }
  }

  private static async computeVolume(): Promise<{ totalVolume: number; volume24h: number }> {
    return cache.getOrSet('stats:volume', 15_000, async () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 24 * 60 * 60;

      const result = await pool.query(`
        SELECT
          COALESCE(SUM(volume_usd), 0) AS total_volume,
          COALESCE(SUM(CASE WHEN timestamp > to_timestamp($1) THEN volume_usd ELSE 0 END), 0) AS volume_24h
        FROM swaps
      `, [oneDayAgo]);

      return {
        totalVolume: parseFloat(result.rows[0].total_volume),
        volume24h: parseFloat(result.rows[0].volume_24h),
      };
    });
  }

  private static async computeFees(): Promise<{
    totalFees: number; fees24h: number;
    totalLpFees: number; lpFees24h: number;
    totalProtocolFees: number; protocolFees24h: number;
  }> {
    return cache.getOrSet('stats:fees', 15_000, async () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 24 * 60 * 60;

      const result = await pool.query(`
        SELECT
          COALESCE(SUM(COALESCE(lp_fee_usd, 0) + COALESCE(protocol_fee_usd, 0)), 0) AS total_fees,
          COALESCE(SUM(CASE WHEN timestamp > to_timestamp($1) THEN COALESCE(lp_fee_usd, 0) + COALESCE(protocol_fee_usd, 0) ELSE 0 END), 0) AS fees_24h,
          COALESCE(SUM(lp_fee_usd), 0) AS total_lp_fees,
          COALESCE(SUM(CASE WHEN timestamp > to_timestamp($1) THEN lp_fee_usd ELSE 0 END), 0) AS lp_fees_24h,
          COALESCE(SUM(protocol_fee_usd), 0) AS total_protocol_fees,
          COALESCE(SUM(CASE WHEN timestamp > to_timestamp($1) THEN protocol_fee_usd ELSE 0 END), 0) AS protocol_fees_24h
        FROM swaps
      `, [oneDayAgo]);

      const row = result.rows[0];

      // Pre-indexing fee volume: $47,396 at 0.25% fee rate, split 90/10 LP/protocol.
      // These swaps occurred before indexing the fees.
      const PRE_INDEX_TOTAL_FEES = 47396 * 0.0025;
      const PRE_INDEX_LP_FEES = PRE_INDEX_TOTAL_FEES * 0.9;
      const PRE_INDEX_PROTOCOL_FEES = PRE_INDEX_TOTAL_FEES * 0.1;

      return {
        totalFees: parseFloat(row.total_fees) + PRE_INDEX_TOTAL_FEES,
        fees24h: parseFloat(row.fees_24h),
        totalLpFees: parseFloat(row.total_lp_fees) + PRE_INDEX_LP_FEES,
        lpFees24h: parseFloat(row.lp_fees_24h),
        totalProtocolFees: parseFloat(row.total_protocol_fees) + PRE_INDEX_PROTOCOL_FEES,
        protocolFees24h: parseFloat(row.protocol_fees_24h),
      };
    });
  }

  private static async computeInterest(): Promise<{
    total_interest_usd: number;
    interest_24h_usd: number;
    total_lp_interest_usd: number;
    lp_interest_24h_usd: number;
    total_protocol_interest_usd: number;
    protocol_interest_24h_usd: number;
  }> {
    return cache.getOrSet('stats:interest', 15_000, async () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 24 * 60 * 60;

      const result = await pool.query(`
        SELECT
          e.pair,
          p.token0,
          p.token1,
          COALESCE(SUM(e.accrued_interest0), 0) AS total_accrued0,
          COALESCE(SUM(e.accrued_interest1), 0) AS total_accrued1,
          COALESCE(SUM(CASE WHEN e.timestamp > to_timestamp($1) THEN e.accrued_interest0 ELSE 0 END), 0) AS accrued0_24h,
          COALESCE(SUM(CASE WHEN e.timestamp > to_timestamp($1) THEN e.accrued_interest1 ELSE 0 END), 0) AS accrued1_24h,
          COALESCE(SUM(e.lp_interest0), 0) AS total_lp0,
          COALESCE(SUM(e.lp_interest1), 0) AS total_lp1,
          COALESCE(SUM(CASE WHEN e.timestamp > to_timestamp($1) THEN e.lp_interest0 ELSE 0 END), 0) AS lp0_24h,
          COALESCE(SUM(CASE WHEN e.timestamp > to_timestamp($1) THEN e.lp_interest1 ELSE 0 END), 0) AS lp1_24h,
          COALESCE(SUM(e.protocol_interest0), 0) AS total_protocol0,
          COALESCE(SUM(e.protocol_interest1), 0) AS total_protocol1,
          COALESCE(SUM(CASE WHEN e.timestamp > to_timestamp($1) THEN e.protocol_interest0 ELSE 0 END), 0) AS protocol0_24h,
          COALESCE(SUM(CASE WHEN e.timestamp > to_timestamp($1) THEN e.protocol_interest1 ELSE 0 END), 0) AS protocol1_24h
        FROM update_pair_events e
        JOIN pools p ON p.pair_address = e.pair
        GROUP BY e.pair, p.token0, p.token1
      `, [oneDayAgo]);

      const uniqueMints = new Set<string>();
      for (const row of result.rows) {
        uniqueMints.add(row.token0);
        uniqueMints.add(row.token1);
      }

      const prices = await fetchTokenPrices(Array.from(uniqueMints));

      let totalInterestUsd = 0;
      let interest24hUsd = 0;
      let totalLpInterestUsd = 0;
      let lpInterest24hUsd = 0;
      let totalProtocolInterestUsd = 0;
      let protocolInterest24hUsd = 0;

      for (const row of result.rows) {
        const p0 = prices.get(row.token0);
        const p1 = prices.get(row.token1);
        const toUsd0 = (raw: string) => p0 ? (parseFloat(raw) / Math.pow(10, p0.decimals)) * p0.price : 0;
        const toUsd1 = (raw: string) => p1 ? (parseFloat(raw) / Math.pow(10, p1.decimals)) * p1.price : 0;

        totalInterestUsd += toUsd0(row.total_accrued0) + toUsd1(row.total_accrued1);
        interest24hUsd += toUsd0(row.accrued0_24h) + toUsd1(row.accrued1_24h);
        totalLpInterestUsd += toUsd0(row.total_lp0) + toUsd1(row.total_lp1);
        lpInterest24hUsd += toUsd0(row.lp0_24h) + toUsd1(row.lp1_24h);
        totalProtocolInterestUsd += toUsd0(row.total_protocol0) + toUsd1(row.total_protocol1);
        protocolInterest24hUsd += toUsd0(row.protocol0_24h) + toUsd1(row.protocol1_24h);
      }

      return {
        total_interest_usd: totalInterestUsd,
        interest_24h_usd: interest24hUsd,
        total_lp_interest_usd: totalLpInterestUsd,
        lp_interest_24h_usd: lpInterest24hUsd,
        total_protocol_interest_usd: totalProtocolInterestUsd,
        protocol_interest_24h_usd: protocolInterest24hUsd,
      };
    });
  }

  private static async computeSwapCount(): Promise<{ totalSwaps: number; swaps24h: number }> {
    return cache.getOrSet('stats:swap_count', 15_000, async () => {
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 24 * 60 * 60;

      const result = await pool.query(`
        SELECT
          COUNT(*)::int AS total_swaps,
          COUNT(*) FILTER (WHERE timestamp > to_timestamp($1))::int AS swaps_24h
        FROM swaps
      `, [oneDayAgo]);

      return {
        totalSwaps: result.rows[0].total_swaps,
        swaps24h: result.rows[0].swaps_24h,
      };
    });
  }

  static async getSwapCountChart(req: Request, res: Response): Promise<void> {
    const VALID_TIMEFRAMES = ['7d', '30d', 'all'] as const;
    type Timeframe = typeof VALID_TIMEFRAMES[number];

    const timeframe = (req.query.timeframe as string) || '7d';
    if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
      res.status(400).json({ success: false, error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(', ')}` });
      return;
    }

    const intervalMap: Record<Timeframe, string | null> = {
      '7d': "7 days",
      '30d': "30 days",
      'all': null,
    };

    const interval = intervalMap[timeframe as Timeframe];

    try {
      const data = await cache.getOrSet(`stats:swap_count_chart_${timeframe}`, 60_000, async () => {
        const whereClause = interval ? `WHERE timestamp >= now() - interval '${interval}'` : '';
        const result = await pool.query(`
          SELECT
            date_trunc('day', timestamp) AS day,
            COUNT(*)::int AS swap_count
          FROM swaps
          ${whereClause}
          GROUP BY day
          ORDER BY day ASC
        `);

        return result.rows.map((r: any) => ({
          date: r.day.toISOString().slice(0, 10),
          swapCount: r.swap_count,
        }));
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching swap count chart:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch swap count chart' });
    }
  }

  static async getInterestChart(req: Request, res: Response): Promise<void> {
    const VALID_TIMEFRAMES = ['7d', '30d', 'all'] as const;
    type Timeframe = typeof VALID_TIMEFRAMES[number];

    const timeframe = (req.query.timeframe as string) || '7d';
    if (!VALID_TIMEFRAMES.includes(timeframe as Timeframe)) {
      res.status(400).json({ success: false, error: `Invalid timeframe. Must be one of: ${VALID_TIMEFRAMES.join(', ')}` });
      return;
    }

    const intervalMap: Record<Timeframe, string | null> = {
      '7d': "7 days",
      '30d': "30 days",
      'all': null,
    };

    const interval = intervalMap[timeframe as Timeframe];

    try {
      const data = await cache.getOrSet(`stats:interest_chart_${timeframe}`, 60_000, async () => {
        const whereClause = interval ? `WHERE e.timestamp >= now() - interval '${interval}'` : '';
        const result = await pool.query(`
          SELECT
            date_trunc('day', e.timestamp) AS day,
            e.pair,
            p.token0,
            p.token1,
            COALESCE(SUM(e.accrued_interest0), 0) AS accrued0,
            COALESCE(SUM(e.accrued_interest1), 0) AS accrued1,
            COALESCE(SUM(e.lp_interest0), 0) AS lp0,
            COALESCE(SUM(e.lp_interest1), 0) AS lp1,
            COALESCE(SUM(e.protocol_interest0), 0) AS protocol0,
            COALESCE(SUM(e.protocol_interest1), 0) AS protocol1
          FROM update_pair_events e
          JOIN pools p ON p.pair_address = e.pair
          ${whereClause}
          GROUP BY day, e.pair, p.token0, p.token1
          ORDER BY day ASC
        `);

        const uniqueMints = new Set<string>();
        for (const row of result.rows) {
          uniqueMints.add(row.token0);
          uniqueMints.add(row.token1);
        }
        const prices = await fetchTokenPrices(Array.from(uniqueMints));

        const dayMap = new Map<string, {
          accrued_interest_usd: number;
          lp_interest_usd: number;
          protocol_interest_usd: number;
        }>();

        for (const row of result.rows) {
          const date = row.day.toISOString().slice(0, 10);
          const p0 = prices.get(row.token0);
          const p1 = prices.get(row.token1);
          const toUsd0 = (raw: string) => p0 ? (parseFloat(raw) / Math.pow(10, p0.decimals)) * p0.price : 0;
          const toUsd1 = (raw: string) => p1 ? (parseFloat(raw) / Math.pow(10, p1.decimals)) * p1.price : 0;

          const entry = dayMap.get(date) ?? { accrued_interest_usd: 0, lp_interest_usd: 0, protocol_interest_usd: 0 };
          entry.accrued_interest_usd += toUsd0(row.accrued0) + toUsd1(row.accrued1);
          entry.lp_interest_usd += toUsd0(row.lp0) + toUsd1(row.lp1);
          entry.protocol_interest_usd += toUsd0(row.protocol0) + toUsd1(row.protocol1);
          dayMap.set(date, entry);
        }

        return Array.from(dayMap.entries()).map(([date, v]) => ({
          date,
          ...v,
        }));
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching interest chart:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch interest chart' });
    }
  }

}
