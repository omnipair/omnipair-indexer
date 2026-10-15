import { Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import type { Program } from '@coral-xyz/anchor';
import type { Omnipair } from '@omnipair/program-interface';
import pool from '../config/database';
import { ApiResponse } from '../types';
import { cache } from '../utils/cache';
import { fetchWalletLpBalances, LiveLpDataUnavailableError, WalletLpBalanceSnapshot } from '../services/walletLpBalanceService';
import { calculateRawLpTokenAmounts } from '../services/currentLpValuationService';
import { fetchPairAccounts, PairAccount, simulateUserPositionGetter } from '../utils/pairSimulation';
import { SimulationResult } from '../types/pairTypes';
import { isValidAddress, initializePairStateService, splitPosition } from './helpers/controllerBase';
import {
  getLpPositionMetricKey,
  getLpPositionMetricsForRows,
  LiquidityPositionMetricInput,
  LpPositionMetricsOptions,
} from '../services/lpPositionMetricsService';

export class PositionController {
  static async getAllPositions(req: Request, res: Response): Promise<void> {
    if (req.query.type === 'liquidity') {
      await PositionController.getAllLiquidityPositions(req, res);
      return;
    }
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);
      const userAddress = req.query.userAddress as string | undefined;

      if (userAddress && !isValidAddress(userAddress)) {
        res.status(400).json({ success: false, error: 'Invalid user address format' });
        return;
      }

      const cacheKey = `positions:${userAddress || 'all'}:${limit}:${offset}`;
      // A wallet refetches its own positions right after a transaction, so its
      // view is never stored, only shared by concurrent identical requests. The
      // unfiltered page costs five simulations per position to rebuild and is
      // held for the webapp's 30-second refresh.
      const ttlMs = userAddress ? 0 : 30 * 1000;
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
    if (req.query.userAddress !== undefined) res.setHeader('Cache-Control', 'no-store');
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);
      const userAddress = req.query.userAddress as string | undefined;
      const poolAddress = req.query.poolAddress as string | undefined;

      if (userAddress !== undefined && !isPublicKey(userAddress)) {
        res.status(400).json({ success: false, error: 'Invalid user address format' });
        return;
      }

      if (poolAddress !== undefined && !isPublicKey(poolAddress)) {
        res.status(400).json({ success: false, error: 'Invalid pool address format' });
        return;
      }
      if (userAddress && req.query.status !== undefined && !['open', 'all'].includes(req.query.status as string)) {
        res.status(400).json({ success: false, error: 'Wallet LP positions support status=open or all (current holdings only)' });
        return;
      }

      const cacheKey = `liq_positions:${userAddress || 'all'}:${poolAddress || 'all'}:${limit}:${offset}`;
      // Wallet ownership is read from token accounts, independently of indexed deposits.
      const data = await cache.getOrSet(cacheKey, userAddress ? 0 : 10 * 1000, async () => {
        let rows: Array<{
          signer: string; pair: string; token0_mint: string; token1_mint: string;
          amount0: string; amount1: string; lp_mint: string; lp_amount: string;
          updated_at: Date | null;
        }>;
        let totalCount: number;
        let balanceObservation: WalletLpBalanceSnapshot['observation'] | undefined;

        if (userAddress) {
          const snapshot = await fetchWalletLpBalances(userAddress);
          balanceObservation = snapshot.observation;
          const holdings = snapshot.holdings
            .filter((holding) => !poolAddress || holding.pair === poolAddress)
            .sort((left, right) => left.pair < right.pair ? -1 : left.pair > right.pair ? 1 : 0);
          totalCount = holdings.length;
          const page = holdings.slice(offset, offset + limit);
          const indexed = page.length > 0 ? await pool.query(
            `SELECT pair, updated_at
             FROM user_liquidity_positions WHERE signer = $1 AND pair = ANY($2::text[])`,
            [userAddress, page.map((holding) => holding.pair)]
          ) : { rows: [] };
          const indexedByPair = new Map(indexed.rows.map((row) => [row.pair, row]));
          rows = page.map((holding) => {
            const previous = indexedByPair.get(holding.pair);
            return {
              signer: userAddress,
              pair: holding.pair,
              token0_mint: holding.token0Mint,
              token1_mint: holding.token1Mint,
              lp_mint: holding.lpMint,
              lp_amount: holding.lpAmount,
              amount0: '0',
              amount1: '0',
              updated_at: previous?.updated_at ?? null,
            };
          });
        } else {
          const countResult = await pool.query(
            'SELECT COUNT(*) as total_count FROM user_liquidity_positions WHERE ($1::text IS NULL OR pair = $1)',
            [poolAddress ?? null]
          );
          totalCount = parseInt(countResult.rows[0].total_count);
          const result = await pool.query(
            `SELECT signer, pair, token0_mint, token1_mint, amount0, amount1,
              lp_mint, lp_amount, updated_at
             FROM user_liquidity_positions
             WHERE ($1::text IS NULL OR pair = $1)
             ORDER BY updated_at DESC, pair ASC, signer ASC
             LIMIT $2 OFFSET $3`,
            [poolAddress ?? null, limit, offset]
          );
          rows = result.rows;
        }

        if (rows.length === 0) {
          return { positions: [], balanceObservation, pagination: { total: totalCount, limit, offset, hasNext: offset + limit < totalCount } };
        }
        let pairAccounts: Map<string, PairAccount | null>;
        const metricOptions: LpPositionMetricsOptions = {};
        if (userAddress) {
          try {
            const pairStateService = await initializePairStateService();
            const program = pairStateService.getProgram();
            if (!program) throw new Error('Omnipair program unavailable');
            pairAccounts = await fetchPairAccounts(program, rows.map((row) => row.pair));
            metricOptions.currentAmountsByPosition = new Map();
            for (const row of rows) {
              const pairAccount = pairAccounts.get(row.pair);
              if (!pairAccount) throw new Error(`Pool state unavailable for ${row.pair}`);
              const amounts = calculateRawLpTokenAmounts(
                row.lp_amount, pairAccount.totalSupply.toString(),
                pairAccount.reserve0.toString(), pairAccount.reserve1.toString()
              );
              row.amount0 = amounts.token0Amount;
              row.amount1 = amounts.token1Amount;
              row.token0_mint = pairAccount.token0.toBase58();
              row.token1_mint = pairAccount.token1.toBase58();
              metricOptions.currentAmountsByPosition.set(getLpPositionMetricKey(row.signer, row.pair), {
                signer: row.signer, pair: row.pair, ...amounts, exact: true,
              });
            }
          } catch (error) {
            throw new LiveLpDataUnavailableError('Unable to value current LP holdings', error);
          }
        } else {
          const pairStateService = await initializePairStateService();
          const program = pairStateService.getProgram();
          pairAccounts = program ? await readPairAccounts(program, rows) : new Map();
        }
        const metricInputs: LiquidityPositionMetricInput[] = rows.map((row) => ({
          signer: row.signer,
          pair: row.pair,
          token0Mint: row.token0_mint,
          token1Mint: row.token1_mint,
          amount0: row.amount0,
          amount1: row.amount1,
          lpAmount: row.lp_amount,
        }));
        const metricsByPosition = await getLpPositionMetricsForRows(pool, metricInputs, metricOptions);

        const enrichedPositions = rows.map((row) => {
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
          balanceObservation,
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
      if (error instanceof LiveLpDataUnavailableError) {
        if (error.retryable) res.setHeader('Retry-After', '1');
        res.status(error.retryable ? 503 : 500).json({
          success: false,
          error: error.retryable
            ? 'Current LP holdings are temporarily unavailable. Please retry.'
            : 'Unable to load current LP holdings.',
          code: error.retryable ? 'LIVE_LP_DATA_UNAVAILABLE' : 'LIVE_LP_DATA_ERROR',
          retryable: error.retryable,
        });
        return;
      }
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

function isPublicKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}
