import { Request, Response } from 'express';
import pool from '../config/database';
import { ApiResponse, PoolRow } from '../types';
import { cache } from '../utils/cache';
import { calculateEmaFromPoolData, fromNad } from '../utils/emaCalculator';
import { generateOgCardSvg, formatLargeNumber, fetchImageAsBase64 } from '../services/ogCardService';
import { fetchTokenPrices } from '../services/jupiterPriceService';
import {
  isValidAddress,
  KNOWN_TOKEN_ICONS,
  initializePairStateService,
  fetchCachedPairState,
  calculateAPR,
  calculateTotalFeesPaid,
  calculateSwapVolume,
} from './helpers/controllerBase';

export class PoolController {
  static async getPoolInfo(req: Request, res: Response): Promise<void> {
    try {
      const pairAddress = req.params.pairAddress;

      if (!pairAddress || !isValidAddress(pairAddress)) {
        res.status(400).json({ success: false, error: 'Valid pair address is required' });
        return;
      }

      const poolData = await cache.getOrSet(`pool_info_${pairAddress}`, 5 * 1000, async () => {
        const [swapResult, poolMetaResult] = await Promise.all([
          pool.query(`
            SELECT reserve0, reserve1, timestamp, ema_price
            FROM swaps 
            WHERE pair = $1
            ORDER BY id DESC
            LIMIT 2
          `, [pairAddress]),
          pool.query(`
            SELECT swap_fee_bps, fixed_cf_bps, token0, token1, lp_mint, rate_model, half_life, version
            FROM pools
            WHERE pair_address = $1
          `, [pairAddress])
        ]);

        if (swapResult.rows.length === 0 && poolMetaResult.rows.length === 0) {
          return null;
        }

        const poolMeta = poolMetaResult.rows[0] || {};

        let reserve0: number | null = null;
        let reserve1: number | null = null;
        let currentEmaPrice0: number | null = null;
        let currentEmaPrice1: number | null = null;
        let price0: number | null = null;
        let price1: number | null = null;
        let timestamp: string | null = null;

        if (swapResult.rows.length > 0) {
          reserve0 = parseFloat(swapResult.rows[0].reserve0);
          reserve1 = parseFloat(swapResult.rows[0].reserve1);
          price0 = reserve1 / reserve0;
          price1 = reserve0 / reserve1;
          timestamp = new Date(swapResult.rows[0].timestamp).toISOString().replace('T', ' ').replace('Z', '+00');

          if (swapResult.rows.length > 1 && swapResult.rows[1].ema_price) {
            console.log('Calculating EMA prices using the latest swap data');
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
        }

        return {
          price0,
          price1,
          emaPrice0: currentEmaPrice0 ?? price0,
          emaPrice1: currentEmaPrice1 ?? price1,
          reserve0,
          reserve1,
          timestamp,
          pairAddress,
          token0: poolMeta.token0 ?? null,
          token1: poolMeta.token1 ?? null,
          lp_mint: poolMeta.lp_mint ?? null,
          rate_model: poolMeta.rate_model ?? null,
          half_life: poolMeta.half_life ?? null,
          version: poolMeta.version ?? null,
          swap_fee_bps: poolMeta.swap_fee_bps ?? null,
          fixed_cf_bps: poolMeta.fixed_cf_bps ?? null
        };
      });

      if (!poolData) {
        res.status(404).json({ success: false, error: 'No pool found for this pair address' });
        return;
      }

      res.json({ success: true, data: poolData });
    } catch (error) {
      console.error('Error fetching pool info:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch pool info' });
    }
  }

  static async getPoolOgCard(req: Request, res: Response): Promise<void> {
    try {
      const pairAddress = req.params.pairAddress;

      if (!pairAddress || !isValidAddress(pairAddress)) {
        res.status(400).json({ success: false, error: 'Valid pair address is required' });
        return;
      }

      const svg = await cache.getOrSet(`og_card_${pairAddress}`, 5 * 60 * 1000, async () => {
        const pairService = await initializePairStateService();

        const [pairState, aprData, poolMetaResult] = await Promise.all([
          fetchCachedPairState(pairService, pairAddress),
          calculateAPR(pairAddress),
          pool.query('SELECT swap_fee_bps, fixed_cf_bps FROM pools WHERE pair_address = $1', [pairAddress])
        ]);

        const poolMeta = poolMetaResult.rows[0] || {};

        const token0IconUrl = pairState.token0.iconUrl || KNOWN_TOKEN_ICONS[pairState.token0.address];
        const token1IconUrl = pairState.token1.iconUrl || KNOWN_TOKEN_ICONS[pairState.token1.address];

        const [token0IconBase64, token1IconBase64, tokenPrices] = await Promise.all([
          token0IconUrl ? fetchImageAsBase64(token0IconUrl) : undefined,
          token1IconUrl ? fetchImageAsBase64(token1IconUrl) : undefined,
          fetchTokenPrices([pairState.token0.address, pairState.token1.address]),
        ]);

        const token0UsdPrice = tokenPrices.get(pairState.token0.address)?.price;
        const token1UsdPrice = tokenPrices.get(pairState.token1.address)?.price;

        const reserve0 = parseFloat(pairState.reserves.token0);
        const reserve1 = parseFloat(pairState.reserves.token1);
        let tvlFormatted: { value: string; suffix: string };

        if (token0UsdPrice) {
          tvlFormatted = formatLargeNumber(reserve0 * token0UsdPrice * 2);
        } else if (token1UsdPrice) {
          tvlFormatted = formatLargeNumber(reserve1 * token1UsdPrice * 2);
        } else {
          tvlFormatted = { value: '--', suffix: '' };
        }

        const swapFee = poolMeta.swap_fee_bps != null
          ? (poolMeta.swap_fee_bps / 100).toFixed(2) + '%'
          : 'N/A';

        const ltv = poolMeta.fixed_cf_bps != null
          ? (poolMeta.fixed_cf_bps / 100).toFixed(0) + '%'
          : 'Dynamic';

        const apr = aprData.apr.toFixed(2) + '%';

        const debt0 = parseFloat(pairState.totalDebts.token0) / Math.pow(10, pairState.token0.decimals);
        const debt1 = parseFloat(pairState.totalDebts.token1) / Math.pow(10, pairState.token1.decimals);
        let totalDebtFormatted: { value: string; suffix: string };

        if (token0UsdPrice || token1UsdPrice) {
          const debt0Usd = token0UsdPrice ? debt0 * token0UsdPrice : 0;
          const debt1Usd = token1UsdPrice ? debt1 * token1UsdPrice : 0;
          totalDebtFormatted = formatLargeNumber(debt0Usd + debt1Usd);
        } else {
          totalDebtFormatted = { value: '--', suffix: '' };
        }

        const spotPrice = reserve1 / reserve0;
        const spotPriceFormatted = spotPrice >= 1000
          ? spotPrice.toFixed(0)
          : spotPrice >= 1
            ? spotPrice.toFixed(2)
            : spotPrice >= 0.0001
              ? spotPrice.toFixed(4)
              : spotPrice.toExponential(2);

        return generateOgCardSvg({
          token0Symbol: pairState.token0.symbol,
          token1Symbol: pairState.token1.symbol,
          token0IconBase64,
          token1IconBase64,
          swapFee,
          ltv,
          apr,
          tvlValue: tvlFormatted.value,
          tvlSuffix: tvlFormatted.suffix,
          totalDebtValue: totalDebtFormatted.value,
          totalDebtSuffix: totalDebtFormatted.suffix,
          spotPriceValue: spotPriceFormatted,
          spotPriceSuffix: pairState.token1.symbol,
        });
      });

      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.send(svg);
    } catch (error) {
      console.error('Error generating OG card:', error);
      res.status(500).json({ success: false, error: 'Failed to generate OG card' });
    }
  }

  static async fetchAllPools(showAll: boolean): Promise<any[]> {
    const cacheKey = `pools:enriched:${showAll ? 'all' : 'visible'}`;

    return cache.getOrSet(cacheKey, 60_000, async () => {
      const visibilityFilter = showAll ? '' : 'WHERE visible = TRUE';

      const result = await pool.query(`
        SELECT id, pair_address, token0, token1, swap_fee_bps, fixed_cf_bps 
        FROM pools 
        ${visibilityFilter}
        ORDER BY id ASC
      `);

      const pairService = await initializePairStateService();

      return Promise.all(
        result.rows.map(async (poolData: PoolRow) => {
          const pairAddress = poolData.pair_address;
          const token0Address = poolData.token0;
          const token1Address = poolData.token1;

          try {
            const [pairState, aprData, feesData, volumeData] = await Promise.all([
              fetchCachedPairState(pairService, pairAddress),
              calculateAPR(pairAddress),
              calculateTotalFeesPaid(pairAddress),
              calculateSwapVolume(pairAddress)
            ]);

            return {
              id: poolData.id,
              pair_address: pairAddress,
              token0: {
                symbol: pairState.token0.symbol,
                name: pairState.token0.name,
                decimals: pairState.token0.decimals,
                address: pairState.token0.address,
                icon: pairState.token0.iconUrl || null
              },
              token1: {
                symbol: pairState.token1.symbol,
                name: pairState.token1.name,
                decimals: pairState.token1.decimals,
                address: pairState.token1.address,
                icon: pairState.token1.iconUrl || null
              },
              reserves: {
                token0: pairState.reserves.token0,
                token1: pairState.reserves.token1
              },
              cash_reserves: {
                token0: pairState.cashReserves.token0,
                token1: pairState.cashReserves.token1
              },
              oracle_prices: {
                token0: pairState.oraclePrices.token0,
                token1: pairState.oraclePrices.token1
              },
              spot_prices: {
                token0: pairState.spotPrices.token0,
                token1: pairState.spotPrices.token1
              },
              interest_rates: {
                token0: Math.max(pairState.rates.token0, 1),
                token1: Math.max(pairState.rates.token1, 1)
              },
              total_debts: {
                token0: pairState.totalDebts.token0,
                token1: pairState.totalDebts.token1
              },
              total_collaterals: {
                token0: pairState.totalCollaterals.token0,
                token1: pairState.totalCollaterals.token1
              },
              utilization: {
                token0: pairState.utilization.token0,
                token1: pairState.utilization.token1
              },
              lp_token: {
                total_supply: pairState.totalSupply,
                decimals: pairState.lpTokenDecimals
              },
              swap_fee_bps: poolData.swap_fee_bps,
              fixed_cf_bps: poolData.fixed_cf_bps,
              apr: aprData,
              total_fees_paid: feesData,
              volume_24h: volumeData
            };
          } catch (error) {
            console.error(`Error fetching data for pool ${pairAddress}:`, error);
            return {
              id: poolData.id,
              pair_address: pairAddress,
              token0: { symbol: 'Unknown', name: 'Unknown', decimals: 0, address: token0Address, icon: null },
              token1: { symbol: 'Unknown', name: 'Unknown', decimals: 0, address: token1Address, icon: null },
              reserves: { token0: '0', token1: '0' },
              cash_reserves: { token0: '0', token1: '0' },
              oracle_prices: { token0: '0', token1: '0' },
              spot_prices: { token0: '0', token1: '0' },
              interest_rates: { token0: 1, token1: 1 },
              total_debts: { token0: '0', token1: '0' },
              total_collaterals: { token0: '0', token1: '0' },
              utilization: { token0: 0, token1: 0 },
              lp_token: { total_supply: '0', decimals: 0 },
              swap_fee_bps: poolData.swap_fee_bps,
              fixed_cf_bps: poolData.fixed_cf_bps,
              apr: { apr: 0, apr_breakdown: { swap_apr: 0, interest_apr: 0 } },
              total_fees_paid: { total_fees_usd: '0', lp_fees_usd: '0', protocol_fees_usd: '0', token0_fees: '0', token1_fees: '0', period: 'all' },
              volume_24h: { volume0: '0', volume1: '0', period: '24hrs' }
            };
          }
        })
      );
    });
  }

  static async getPools(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);
      const showAll = req.query.visibility === 'all';

      const allPools = await PoolController.fetchAllPools(showAll);
      const paginatedPools = allPools.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          pools: paginatedPools,
          pagination: {
            total: allPools.length,
            limit,
            offset,
            hasNext: offset + limit < allPools.length
          }
        }
      } as ApiResponse);
    } catch (error) {
      console.error('Error fetching pools:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch pools' });
    }
  }

  static async getPoolsByTokens(req: Request, res: Response): Promise<void> {
    try {
      const token0 = req.params.token0 as string;
      const token1 = req.params.token1 as string;

      if (!token0 || !token1 || token0 === token1) {
        res.status(400).json({ success: false, error: 'Both token0 and token1 path parameters are required and must be different' });
        return;
      }
      if (!isValidAddress(token0) || !isValidAddress(token1)) {
        res.status(400).json({ success: false, error: 'Invalid token address format' });
        return;
      }

      const result = await pool.query(`
        SELECT id, pair_address, token0, token1, swap_fee_bps, fixed_cf_bps 
        FROM pools 
        WHERE (token0 = $1 AND token1 = $2) OR (token0 = $2 AND token1 = $1)
        ORDER BY id ASC
        LIMIT 1
      `, [token0, token1]);

      const response: ApiResponse = {
        success: true,
        data: {
          pools: result.rows,
          filters: {
            token0,
            token1
          },
          count: result.rows.length
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching pools by tokens:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch pools by tokens'
      };
      res.status(500).json(response);
    }
  }

  static async getTokensByToken(req: Request, res: Response): Promise<void> {
    try {
      const token = req.params.token as string;

      if (!token || !isValidAddress(token)) {
        res.status(400).json({ success: false, error: 'Valid token address is required' });
        return;
      }

      const result = await pool.query(`
        SELECT 
          pair_address,
          token1 as paired_token,
          swap_fee_bps,
          fixed_cf_bps
        FROM pools WHERE token0 = $1
        UNION
        SELECT 
          pair_address,
          token0 as paired_token,
          swap_fee_bps,
          fixed_cf_bps
        FROM pools WHERE token1 = $1
        ORDER BY paired_token ASC
      `, [token]);

      const tokens = result.rows.map(row => row.paired_token);

      const response: ApiResponse = {
        success: true,
        data: {
          tokens,
          pools: result.rows,
          inputToken: token,
          count: result.rows.length
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching tokens by token:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch tokens by token'
      };
      res.status(500).json(response);
    }
  }


  static async getTvl(_req: Request, res: Response): Promise<void> {
    try {
      const allPools = await PoolController.fetchAllPools(false);

      const uniqueMints = new Set<string>();
      for (const p of allPools) {
        if (p.token0.address) uniqueMints.add(p.token0.address);
        if (p.token1.address) uniqueMints.add(p.token1.address);
      }

      const prices = await fetchTokenPrices(Array.from(uniqueMints));

      let totalTvl = 0;
      const poolTvls = allPools.map((p) => {
        const reserve0 = parseFloat(p.reserves.token0);
        const reserve1 = parseFloat(p.reserves.token1);
        const price0 = prices.get(p.token0.address)?.price;
        const price1 = prices.get(p.token1.address)?.price;

        let tvl = 0;
        if (price0 && price1) {
          tvl = reserve0 * price0 + reserve1 * price1;
        } else if (price0) {
          tvl = reserve0 * price0 * 2;
        } else if (price1) {
          tvl = reserve1 * price1 * 2;
        }

        totalTvl += tvl;

        return {
          pair_address: p.pair_address,
          token0: { symbol: p.token0.symbol, address: p.token0.address },
          token1: { symbol: p.token1.symbol, address: p.token1.address },
          tvl,
        };
      });

      res.json({
        success: true,
        data: {
          total_tvl: totalTvl,
          pools: poolTvls,
          pool_count: allPools.length,
        }
      });
    } catch (error) {
      console.error('Error calculating TVL:', error);
      res.status(500).json({ success: false, error: 'Failed to calculate TVL' });
    }
  }
}
