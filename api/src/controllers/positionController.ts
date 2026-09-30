import { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import type { Omnipair } from '@omnipair/program-interface';
import pool from '../config/database';
import { ApiResponse } from '../types';
import { cache } from '../utils/cache';
import { fetchPairAccounts, PairAccount, simulateUserPositionGetter } from '../utils/pairSimulation';
import { SimulationResult } from '../types/pairTypes';
import { isValidAddress, initializePairStateService, splitPosition } from './helpers/controllerBase';
import {
  getLpPositionMetricKey,
  getLpPositionMetricsForRows,
  LiquidityPositionMetricInput,
} from '../services/lpPositionMetricsService';

export class PositionController {
  static async getAllPositions(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);
      const userAddress = req.query.userAddress as string | undefined;

      if (userAddress && !isValidAddress(userAddress)) {
        res.status(400).json({ success: false, error: 'Invalid user address format' });
        return;
      }

      const cacheKey = `positions:${userAddress || 'all'}:${limit}:${offset}`;
      // Rebuilding a page costs five simulations per position, so the unfiltered
      // page every client shares is held longer than a single wallet's view.
      const ttlMs = userAddress ? 10 * 1000 : 60 * 1000;
      const data = await cache.getOrSet(cacheKey, ttlMs, async () => {
        let countQuery: string;
        let dataQuery: string;
        let countParams: any[];
        let queryParams: any[];

        if (userAddress) {
          countQuery = 'SELECT COUNT(*) as total_count FROM user_borrow_positions WHERE signer = $1 AND (collateral0::numeric > 0 OR collateral1::numeric > 0)';
          countParams = [userAddress];
          dataQuery = `
            SELECT 
              signer, pair, position, collateral0, collateral1,
              debt0_shares, debt1_shares,
              collateral0_liquidation_cf_bps, collateral1_liquidation_cf_bps,
              collateral0_max_cf_bps, collateral1_max_cf_bps, event_timestamp
            FROM user_borrow_positions
            WHERE signer = $1 AND (collateral0::numeric > 0 OR collateral1::numeric > 0)
            ORDER BY event_timestamp DESC
            LIMIT $2 OFFSET $3
          `;
          queryParams = [userAddress, limit, offset];
        } else {
          countQuery = 'SELECT COUNT(*) as total_count FROM user_borrow_positions WHERE collateral0::numeric > 0 OR collateral1::numeric > 0';
          countParams = [];
          dataQuery = `
            SELECT 
              signer, pair, position, collateral0, collateral1,
              debt0_shares, debt1_shares,
              collateral0_liquidation_cf_bps, collateral1_liquidation_cf_bps,
              collateral0_max_cf_bps, collateral1_max_cf_bps, event_timestamp
            FROM user_borrow_positions
            WHERE collateral0::numeric > 0 OR collateral1::numeric > 0
            ORDER BY event_timestamp DESC
            LIMIT $1 OFFSET $2
          `;
          queryParams = [limit, offset];
        }

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].total_count);
        const result = await pool.query(dataQuery, queryParams);

        const pairStateService = await initializePairStateService();
        const program = pairStateService.getProgram();
        const connection = pairStateService.getConnection();
        const pairAccounts = program ? await readPairAccounts(program, result.rows) : new Map<string, PairAccount | null>();

        const enrichedPositions = await Promise.all(
          result.rows.map(async (row) => {
            const basePosition = {
              signer: row.signer,
              pair: row.pair,
              position: row.position,
              collateral0: row.collateral0,
              collateral1: row.collateral1,
              debt0_shares: row.debt0_shares,
              debt1_shares: row.debt1_shares,
              collateral0_liquidation_cf_bps: row.collateral0_liquidation_cf_bps,
              collateral1_liquidation_cf_bps: row.collateral1_liquidation_cf_bps,
              collateral0_max_cf_bps: row.collateral0_max_cf_bps,
              collateral1_max_cf_bps: row.collateral1_max_cf_bps,
              event_timestamp: row.event_timestamp,
            };

            const pairAccount = pairAccounts.get(row.pair);
            if (!program || !pairAccount) {
              return splitPosition(basePosition);
            }

            try {
              const pairPda = new PublicKey(row.pair);
              const userPositionPda = new PublicKey(row.position);
              const { rateModel } = pairAccount;
              const token0Address = pairAccount.token0.toString();
              const token1Address = pairAccount.token1.toString();

              const [
                dynamicBorrowLimitResult,
                liquidationPriceResult,
                debtWithInterestResult,
                collateralValueResult,
                liquidationBorrowLimitResult,
              ] = await Promise.allSettled([
                simulateUserPositionGetter(program, connection, pairPda, userPositionPda, { userDynamicBorrowLimit: {} }, rateModel),
                simulateUserPositionGetter(program, connection, pairPda, userPositionPda, { userLiquidationPrice: {} }, rateModel),
                simulateUserPositionGetter(program, connection, pairPda, userPositionPda, { userDebtWithInterest: {} }, rateModel),
                simulateUserPositionGetter(program, connection, pairPda, userPositionPda, { userCollateralValueWithImpact: {} }, rateModel),
                simulateUserPositionGetter(program, connection, pairPda, userPositionPda, { userLiquidationBorrowLimit: {} }, rateModel),
              ]);

              const extract = (label: string, settled: PromiseSettledResult<SimulationResult>) => {
                if (settled.status === 'fulfilled') {
                  return { token0: settled.value.value0, token1: settled.value.value1 };
                }
                console.error(`Simulation failed for ${label} on position ${row.position}:`, settled.reason);
                return null;
              };

              return splitPosition({
                ...basePosition,
                token0Address,
                token1Address,
                dynamicBorrowLimit: extract('userDynamicBorrowLimit', dynamicBorrowLimitResult),
                liquidationPrice: extract('userLiquidationPrice', liquidationPriceResult),
                debtWithInterest: extract('userDebtWithInterest', debtWithInterestResult),
                collateralValueWithImpact: extract('userCollateralValueWithImpact', collateralValueResult),
                liquidationBorrowLimit: extract('userLiquidationBorrowLimit', liquidationBorrowLimitResult),
              });
            } catch (error) {
              console.error(`Error fetching position data for ${row.position}:`, error);
              return splitPosition(basePosition);
            }
          })
        );

        const positions = enrichedPositions.flat().filter(pos => pos !== null);

        return {
          positions,
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasNext: offset + limit < totalCount
          }
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching all positions:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch all positions'
      };
      res.status(500).json(response);
    }
  }

  static async getAllLiquidityPositions(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);
      const userAddress = req.query.userAddress as string | undefined;

      if (userAddress && !isValidAddress(userAddress)) {
        res.status(400).json({ success: false, error: 'Invalid user address format' });
        return;
      }

      const cacheKey = `liq_positions:${userAddress || 'all'}:${limit}:${offset}`;
      const data = await cache.getOrSet(cacheKey, 10 * 1000, async () => {
        let countQuery: string;
        let dataQuery: string;
        let countParams: any[];
        let queryParams: any[];

        if (userAddress) {
          countQuery = 'SELECT COUNT(*) as total_count FROM user_liquidity_positions WHERE signer = $1';
          countParams = [userAddress];
          dataQuery = `
            SELECT signer, pair, token0_mint, token1_mint, amount0, amount1,
              lp_mint, lp_amount, updated_at
            FROM user_liquidity_positions
            WHERE signer = $1
            ORDER BY updated_at DESC
            LIMIT $2 OFFSET $3
          `;
          queryParams = [userAddress, limit, offset];
        } else {
          countQuery = 'SELECT COUNT(*) as total_count FROM user_liquidity_positions';
          countParams = [];
          dataQuery = `
            SELECT signer, pair, token0_mint, token1_mint, amount0, amount1,
              lp_mint, lp_amount, updated_at
            FROM user_liquidity_positions
            ORDER BY updated_at DESC
            LIMIT $1 OFFSET $2
          `;
          queryParams = [limit, offset];
        }

        const countResult = await pool.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].total_count);
        const result = await pool.query(dataQuery, queryParams);
        const metricInputs: LiquidityPositionMetricInput[] = result.rows.map((row) => ({
          signer: row.signer,
          pair: row.pair,
          token0Mint: row.token0_mint,
          token1Mint: row.token1_mint,
          amount0: row.amount0,
          amount1: row.amount1,
          lpAmount: row.lp_amount,
        }));
        const metricsByPosition = await getLpPositionMetricsForRows(pool, metricInputs);

        const pairStateService = await initializePairStateService();
        const program = pairStateService.getProgram();
        const pairAccounts = program ? await readPairAccounts(program, result.rows) : new Map<string, PairAccount | null>();

        const enrichedPositions = result.rows.map((row) => {
          const basePosition = {
            signer: row.signer,
            pair: row.pair,
            token0Mint: row.token0_mint,
            token1Mint: row.token1_mint,
            amount0: row.amount0,
            amount1: row.amount1,
            lpMint: row.lp_mint,
            lpAmount: row.lp_amount,
            timestamp: row.updated_at,
            token0Address: row.token0_mint,
            token1Address: row.token1_mint,
            earnings: metricsByPosition.get(getLpPositionMetricKey(row.signer, row.pair))?.earnings,
            valueDelta: metricsByPosition.get(getLpPositionMetricKey(row.signer, row.pair))?.valueDelta,
          };

          const pairAccount = pairAccounts.get(row.pair);
          if (pairAccount) {
            basePosition.token0Address = pairAccount.token0.toString();
            basePosition.token1Address = pairAccount.token1.toString();
          }

          return basePosition;
        });

        return {
          positions: enrichedPositions,
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasNext: offset + limit < totalCount
          }
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching all liquidity positions:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch all liquidity positions'
      };
      res.status(500).json(response);
    }
  }
}

/** One read for every pair on the page; rows keep their indexed values when it fails. */
async function readPairAccounts(
  program: Program<Omnipair>,
  rows: Array<{ pair: string }>
): Promise<Map<string, PairAccount | null>> {
  try {
    return await fetchPairAccounts(program, rows.map((row) => row.pair));
  } catch (error) {
    console.error('Error fetching pair accounts for positions page:', error);
    return new Map();
  }
}
