import { Request, Response } from 'express';
import pool from '../config/database';
import { cache } from '../utils/cache';
import { PoolController } from './poolController';
import { fetchTokenPrices } from '../services/jupiterPriceService';

interface CoinGeckoTicker {
  ticker_id: string;
  base_currency: string;
  target_currency: string;
  pool_id: string;
  last_price: string;
  base_volume: string;
  target_volume: string;
  liquidity_in_usd: string;
  bid: string;
  ask: string;
  high: string;
  low: string;
}

export class CoinGeckoController {
  static async getTickers(_req: Request, res: Response): Promise<void> {
    try {
      const tickers = await cache.getOrSet<CoinGeckoTicker[]>('coingecko:tickers', 60_000, async () => {
        const allPools = await PoolController.fetchAllPools(false, false);

        const uniqueMints = new Set<string>();
        for (const p of allPools) {
          if (p.token0.address) uniqueMints.add(p.token0.address);
          if (p.token1.address) uniqueMints.add(p.token1.address);
        }

        const [prices, highLowResult] = await Promise.all([
          fetchTokenPrices(Array.from(uniqueMints)),
          pool.query(`
            SELECT
              pair,
              MAX(reserve1::numeric / NULLIF(reserve0::numeric, 0)) AS high_raw,
              MIN(reserve1::numeric / NULLIF(reserve0::numeric, 0)) AS low_raw
            FROM swaps
            WHERE timestamp > now() - interval '24 hours'
              AND reserve0 > 0 AND reserve1 > 0
            GROUP BY pair
          `),
        ]);

        const highLowMap = new Map<string, { highRaw: number; lowRaw: number }>();
        for (const row of highLowResult.rows) {
          highLowMap.set(row.pair, {
            highRaw: parseFloat(row.high_raw),
            lowRaw: parseFloat(row.low_raw),
          });
        }

        const result: CoinGeckoTicker[] = [];

        for (const p of allPools) {
          const reserve0 = parseFloat(p.reserves.token0);
          const reserve1 = parseFloat(p.reserves.token1);

          if (reserve0 <= 0 || reserve1 <= 0) continue;

          const lastPrice = reserve1 / reserve0;
          const feeBps = parseFloat(p.swap_fee_bps) || 0;
          const feeMultiplier = feeBps / 10000;

          const d0 = p.token0.decimals || 6;
          const d1 = p.token1.decimals || 6;
          const baseVolume = parseFloat(p.volume_24h?.volume0 || '0') / Math.pow(10, d0);
          const targetVolume = parseFloat(p.volume_24h?.volume1 || '0') / Math.pow(10, d1);

          const price0Usd = prices.get(p.token0.address)?.price;
          const price1Usd = prices.get(p.token1.address)?.price;
          let liquidityUsd = 0;
          if (price0Usd && price1Usd) {
            liquidityUsd = reserve0 * price0Usd + reserve1 * price1Usd;
          } else if (price0Usd) {
            liquidityUsd = reserve0 * price0Usd * 2;
          } else if (price1Usd) {
            liquidityUsd = reserve1 * price1Usd * 2;
          }

          const decimalAdjustment = Math.pow(10, d0 - d1);
          const highLow = highLowMap.get(p.pair_address);
          const high = highLow ? highLow.highRaw * decimalAdjustment : lastPrice;
          const low = highLow ? highLow.lowRaw * decimalAdjustment : lastPrice;

          result.push({
            ticker_id: `${p.token0.address}_${p.token1.address}`,
            base_currency: p.token0.address,
            target_currency: p.token1.address,
            pool_id: p.pair_address,
            last_price: lastPrice.toString(),
            base_volume: baseVolume.toString(),
            target_volume: targetVolume.toString(),
            liquidity_in_usd: liquidityUsd.toString(),
            bid: (lastPrice * (1 - feeMultiplier)).toString(),
            ask: (lastPrice * (1 + feeMultiplier)).toString(),
            high: high.toString(),
            low: low.toString(),
          });
        }

        return result;
      });

      res.json(tickers);
    } catch (error) {
      console.error('Error fetching CoinGecko tickers:', error);
      res.status(500).json({ error: 'Failed to fetch tickers' });
    }
  }
}
