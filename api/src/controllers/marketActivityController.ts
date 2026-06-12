import { Request, Response } from 'express';
import { ApiResponse } from '../types';
import { cache } from '../utils/cache';
import { timedQuery } from '../utils/dbQuery';
import { perfMetrics } from '../utils/perfMetrics';
import { isValidAddress } from './helpers/controllerBase';

export type MarketActivityCategory = 'swaps' | 'liquidity' | 'lending';
export type MarketActivitySort = 'recent' | 'oldest';

const DEFAULT_ACTIVITY_CATEGORIES: MarketActivityCategory[] = ['swaps', 'liquidity', 'lending'];

interface MarketActivityQueryInput {
  categories: MarketActivityCategory[];
  limit: number;
  offset: number;
  poolAddress: string;
  sort: MarketActivitySort;
}

interface MarketActivityQuery {
  params: Array<string | number>;
  query: string;
}

interface MarketActivityRow {
  activity_type: string;
  actor: string | null;
  amount0: string | null;
  amount1: string | null;
  amount_in: string | null;
  amount_out: string | null;
  collateral0: string | null;
  collateral1: string | null;
  collateral0_liquidated: string | null;
  collateral1_liquidated: string | null;
  collateral_price: string | null;
  debt0_liquidated: string | null;
  debt1_liquidated: string | null;
  debt0_shares: string | null;
  debt1_shares: string | null;
  event_id: string;
  event_timestamp: Date | string;
  is_token0_in: boolean | null;
  lending_event_type: string | null;
  liquidator: string | null;
  liquidity: string | null;
  liquidity_event_type: string | null;
  pair: string;
  position: string | null;
  slot: string | null;
  token0: string | null;
  token1: string | null;
  tx_signature: string | null;
}

export function resolveMarketActivityCacheTtlMs(limit: number, offset: number): number {
  if (offset <= limit * 2) {
    return 20 * 1000;
  }
  if (offset <= limit * 10) {
    return 60 * 1000;
  }
  return 180 * 1000;
}

export function parseMarketActivityCategories(rawCategories?: string): MarketActivityCategory[] {
  if (!rawCategories) {
    return DEFAULT_ACTIVITY_CATEGORIES;
  }

  const normalized = rawCategories
    .split(',')
    .map((category) => category.trim().toLowerCase())
    .filter((category): category is MarketActivityCategory =>
      category === 'swaps' || category === 'liquidity' || category === 'lending'
    );

  if (normalized.length === 0) {
    return DEFAULT_ACTIVITY_CATEGORIES;
  }

  return DEFAULT_ACTIVITY_CATEGORIES.filter((category) => normalized.includes(category));
}

export function parseMarketActivitySort(rawSort?: string): MarketActivitySort {
  return (rawSort || 'recent').toLowerCase() === 'oldest' ? 'oldest' : 'recent';
}

export function buildMarketActivityQuery(input: MarketActivityQueryInput): MarketActivityQuery {
  const orderDirection = input.sort === 'oldest' ? 'ASC' : 'DESC';
  const unions: string[] = [];

  if (input.categories.includes('swaps')) {
    unions.push(`
      SELECT
        'swap'::text AS activity_type,
        s.id::text AS event_id,
        s.pair AS pair,
        s."timestamp" AS event_timestamp,
        s.tx_sig AS tx_signature,
        s.user_address AS actor,
        s.amount_in::text AS amount_in,
        s.amount_out::text AS amount_out,
        s.is_token0_in AS is_token0_in,
        NULL::text AS amount0,
        NULL::text AS amount1,
        NULL::text AS liquidity,
        NULL::text AS liquidity_event_type,
        NULL::text AS lending_event_type,
        NULL::text AS position,
        NULL::text AS liquidator,
        NULL::text AS collateral0,
        NULL::text AS collateral1,
        NULL::text AS debt0_shares,
        NULL::text AS debt1_shares,
        NULL::text AS collateral0_liquidated,
        NULL::text AS collateral1_liquidated,
        NULL::text AS debt0_liquidated,
        NULL::text AS debt1_liquidated,
        NULL::text AS collateral_price,
        s.slot::text AS slot
      FROM swaps s
      WHERE s.pair = $1
    `);
  }

  if (input.categories.includes('liquidity')) {
    unions.push(`
      SELECT
        'liquidity'::text AS activity_type,
        al.id::text AS event_id,
        al.pair AS pair,
        al."timestamp" AS event_timestamp,
        al.tx_sig AS tx_signature,
        al.user_address AS actor,
        NULL::text AS amount_in,
        NULL::text AS amount_out,
        NULL::boolean AS is_token0_in,
        al.amount0::text AS amount0,
        al.amount1::text AS amount1,
        al.liquidity::text AS liquidity,
        al.event_type::text AS liquidity_event_type,
        NULL::text AS lending_event_type,
        NULL::text AS position,
        NULL::text AS liquidator,
        NULL::text AS collateral0,
        NULL::text AS collateral1,
        NULL::text AS debt0_shares,
        NULL::text AS debt1_shares,
        NULL::text AS collateral0_liquidated,
        NULL::text AS collateral1_liquidated,
        NULL::text AS debt0_liquidated,
        NULL::text AS debt1_liquidated,
        NULL::text AS collateral_price,
        al.slot::text AS slot
      FROM adjust_liquidity al
      WHERE al.pair = $1
    `);
  }

  if (input.categories.includes('lending')) {
    unions.push(`
      SELECT
        'lending'::text AS activity_type,
        ('collateral_adjustment:' || ace.id::text) AS event_id,
        ace.pair AS pair,
        ace.event_timestamp AS event_timestamp,
        ace.transaction_signature AS tx_signature,
        ace.signer AS actor,
        NULL::text AS amount_in,
        NULL::text AS amount_out,
        NULL::boolean AS is_token0_in,
        ace.amount0::text AS amount0,
        ace.amount1::text AS amount1,
        NULL::text AS liquidity,
        NULL::text AS liquidity_event_type,
        'collateral_adjustment'::text AS lending_event_type,
        NULL::text AS position,
        NULL::text AS liquidator,
        NULL::text AS collateral0,
        NULL::text AS collateral1,
        NULL::text AS debt0_shares,
        NULL::text AS debt1_shares,
        NULL::text AS collateral0_liquidated,
        NULL::text AS collateral1_liquidated,
        NULL::text AS debt0_liquidated,
        NULL::text AS debt1_liquidated,
        NULL::text AS collateral_price,
        ace.slot::text AS slot
      FROM adjust_collateral_events ace
      WHERE ace.pair = $1
      UNION ALL
      SELECT
        'lending'::text AS activity_type,
        ('debt_adjustment:' || ade.id::text) AS event_id,
        ade.pair AS pair,
        ade.event_timestamp AS event_timestamp,
        ade.transaction_signature AS tx_signature,
        ade.signer AS actor,
        NULL::text AS amount_in,
        NULL::text AS amount_out,
        NULL::boolean AS is_token0_in,
        ade.amount0::text AS amount0,
        ade.amount1::text AS amount1,
        NULL::text AS liquidity,
        NULL::text AS liquidity_event_type,
        'debt_adjustment'::text AS lending_event_type,
        NULL::text AS position,
        NULL::text AS liquidator,
        NULL::text AS collateral0,
        NULL::text AS collateral1,
        NULL::text AS debt0_shares,
        NULL::text AS debt1_shares,
        NULL::text AS collateral0_liquidated,
        NULL::text AS collateral1_liquidated,
        NULL::text AS debt0_liquidated,
        NULL::text AS debt1_liquidated,
        NULL::text AS collateral_price,
        ade.slot::text AS slot
      FROM adjust_debt_events ade
      WHERE ade.pair = $1
      UNION ALL
      SELECT
        'lending'::text AS activity_type,
        ('liquidation:' || uple.id::text) AS event_id,
        uple.pair AS pair,
        uple.event_timestamp AS event_timestamp,
        uple.transaction_signature AS tx_signature,
        uple.signer AS actor,
        NULL::text AS amount_in,
        NULL::text AS amount_out,
        NULL::boolean AS is_token0_in,
        NULL::text AS amount0,
        NULL::text AS amount1,
        NULL::text AS liquidity,
        NULL::text AS liquidity_event_type,
        'liquidation'::text AS lending_event_type,
        uple.position::text AS position,
        uple.liquidator::text AS liquidator,
        NULL::text AS collateral0,
        NULL::text AS collateral1,
        NULL::text AS debt0_shares,
        NULL::text AS debt1_shares,
        uple.collateral0_liquidated::text AS collateral0_liquidated,
        uple.collateral1_liquidated::text AS collateral1_liquidated,
        uple.debt0_liquidated::text AS debt0_liquidated,
        uple.debt1_liquidated::text AS debt1_liquidated,
        uple.collateral_price::text AS collateral_price,
        uple.slot::text AS slot
      FROM user_position_liquidated_events uple
      WHERE uple.pair = $1
    `);
  }

  if (unions.length === 0) {
    return {
      params: [input.poolAddress, input.limit + 1, input.offset],
      query: '',
    };
  }

  return {
    params: [input.poolAddress, input.limit + 1, input.offset],
    query: `
      WITH combined_events AS (
        ${unions.join('\nUNION ALL\n')}
      )
      SELECT
        ce.*,
        p.token0,
        p.token1
      FROM combined_events ce
      LEFT JOIN pools p ON ce.pair = p.pair_address
      ORDER BY ce.event_timestamp ${orderDirection}, ce.event_id ${orderDirection}
      LIMIT $2 OFFSET $3
    `,
  };
}

export function mapMarketActivityRows(rows: MarketActivityRow[]) {
  return rows.map((row) => ({
    type: row.activity_type,
    timestamp: row.event_timestamp,
    txSignature: row.tx_signature,
    status: null,
    pair: {
      address: row.pair,
      token0: row.token0 || null,
      token1: row.token1 || null
    },
    amounts: {
      amountIn: row.amount_in,
      amountOut: row.amount_out,
      amount0: row.amount0,
      amount1: row.amount1,
      liquidity: row.liquidity,
      collateral0: row.collateral0,
      collateral1: row.collateral1,
      debt0Shares: row.debt0_shares,
      debt1Shares: row.debt1_shares,
      collateral0Liquidated: row.collateral0_liquidated,
      collateral1Liquidated: row.collateral1_liquidated,
      debt0Liquidated: row.debt0_liquidated,
      debt1Liquidated: row.debt1_liquidated
    },
    details: {
      eventId: row.event_id,
      activityType: row.activity_type,
      liquidityEventType: row.liquidity_event_type,
      lendingEventType: row.lending_event_type,
      isToken0In: row.is_token0_in,
      collateralPrice: row.collateral_price,
      actor: row.actor,
      position: row.position,
      liquidator: row.liquidator,
      slot: row.slot
    }
  }));
}

export class MarketActivityController {
  static async getMarketActivity(req: Request, res: Response): Promise<void> {
    const endpointMetric = 'pools.activity';
    const endpointStartedAt = Date.now();

    try {
      const poolAddress = req.params.poolAddress;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 100, 1), 100);
      const offset = Math.min(Math.max(parseInt(req.query.offset as string) || 0, 0), 10000);
      const sort = parseMarketActivitySort(req.query.sort as string | undefined);
      const categories = parseMarketActivityCategories(req.query.categories as string | undefined);

      if (!poolAddress || !isValidAddress(poolAddress)) {
        res.status(400).json({ success: false, error: 'Valid pool address is required' });
        return;
      }

      const cacheKey = `activity:pool:${poolAddress}:categories:${categories.join(',')}:sort:${sort}:limit:${limit}:offset:${offset}`;
      const cacheTtlMs = resolveMarketActivityCacheTtlMs(limit, offset);

      const { data, cacheStatus } = await cache.getOrSetWithMeta(cacheKey, cacheTtlMs, async () => {
        const builtQuery = buildMarketActivityQuery({
          categories,
          limit,
          offset,
          poolAddress,
          sort
        });

        if (builtQuery.query.length === 0) {
          return {
            items: [],
            pagination: {
              total: null,
              limit,
              offset,
              hasNext: false
            },
            filters: {
              categories,
              poolAddress,
              sort
            }
          };
        }

        const result = await timedQuery('pools.activity', builtQuery.query, builtQuery.params);
        const hasNext = result.rows.length > limit;
        const rows = hasNext ? result.rows.slice(0, limit) : result.rows;

        return {
          items: mapMarketActivityRows(rows as MarketActivityRow[]),
          pagination: {
            total: null,
            limit,
            offset,
            hasNext
          },
          filters: {
            categories,
            poolAddress,
            sort
          }
        };
      });

      perfMetrics.recordCacheLookup(endpointMetric, cacheStatus);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Error fetching market activity:', error);
      const response: ApiResponse = {
        success: false,
        error: 'Failed to fetch market activity'
      };
      res.status(500).json(response);
    } finally {
      perfMetrics.recordEndpointLatency(endpointMetric, Date.now() - endpointStartedAt);
    }
  }
}
