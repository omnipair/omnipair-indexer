import { Request, Response } from 'express';
import pool from '../config/database';
import { isValidAddress } from './helpers/controllerBase';

function parseLimitOffset(req: Request) {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
  return { limit, offset };
}

function marketRow(row: any) {
  return {
    marketAddress: row.market_address,
    baseMint: row.base_mint,
    quoteMint: row.quote_mint,
    baseYlpMint: row.base_ylp_mint,
    quoteYlpMint: row.quote_ylp_mint,
    baseHlpMint: row.base_hlp_mint,
    quoteHlpMint: row.quote_hlp_mint,
    baseCollateralVault: row.base_collateral_vault,
    quoteCollateralVault: row.quote_collateral_vault,
    baseInsuranceVault: row.base_insurance_vault,
    quoteInsuranceVault: row.quote_insurance_vault,
    operator: row.operator,
    manager: row.manager,
    targetHlpLeverageBps: row.target_hlp_leverage_bps,
    swapFeeBps: row.swap_fee_bps,
    operatorFeeBps: row.operator_fee_bps,
    protocolFeeBps: row.protocol_fee_bps,
    paramsHash: row.params_hash ? Buffer.from(row.params_hash).toString('hex') : null,
    version: row.version,
    reduceOnly: row.reduce_only,
    createdTxSig: row.created_tx_sig,
    createdSlot: row.created_slot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    swapCount: Number(row.swap_count ?? 0),
    lastSwapAt: row.last_swap_at ?? null,
    state: row.snapshot_updated_at
      ? {
          baseReserve: row.snapshot_base_reserve,
          quoteReserve: row.snapshot_quote_reserve,
          baseYlpSupply: row.snapshot_base_ylp_supply,
          quoteYlpSupply: row.snapshot_quote_ylp_supply,
          fixedBaseDebt: row.snapshot_fixed_base_debt,
          fixedQuoteDebt: row.snapshot_fixed_quote_debt,
          recognizedBaseCollateralForQuoteDebt:
            row.snapshot_recognized_base_collateral_for_quote_debt,
          recognizedQuoteCollateralForBaseDebt:
            row.snapshot_recognized_quote_collateral_for_base_debt,
          effectiveBaseDebtNad: row.snapshot_effective_base_debt_nad,
          effectiveQuoteDebtNad: row.snapshot_effective_quote_debt_nad,
          baseDebtHealthBps: row.snapshot_base_debt_health_bps,
          quoteDebtHealthBps: row.snapshot_quote_debt_health_bps,
          sourceTxSig: row.snapshot_source_tx_sig,
          sourceSlot: row.snapshot_source_slot,
          updatedAt: row.snapshot_updated_at,
        }
      : null,
  };
}

function eventRow(row: any) {
  return {
    id: Number(row.id),
    eventType: row.event_type,
    market: row.market,
    owner: row.owner,
    assetMint: row.asset_mint,
    txSig: row.tx_sig,
    slot: row.slot,
    instructionIndex: row.instruction_index,
    instructionPath: row.instruction_path,
    timestamp: row.timestamp,
    payload: row.payload,
  };
}

export class V2MarketController {
  static async getMarkets(req: Request, res: Response): Promise<void> {
    try {
      const { limit, offset } = parseLimitOffset(req);
      const baseMint = req.query.baseMint as string | undefined;
      const quoteMint = req.query.quoteMint as string | undefined;
      const filters: string[] = [];
      const values: any[] = [];

      if (baseMint) {
        if (!isValidAddress(baseMint)) {
          res.status(400).json({ success: false, error: 'Valid baseMint is required' });
          return;
        }
        values.push(baseMint);
        filters.push(`m.base_mint = $${values.length}`);
      }

      if (quoteMint) {
        if (!isValidAddress(quoteMint)) {
          res.status(400).json({ success: false, error: 'Valid quoteMint is required' });
          return;
        }
        values.push(quoteMint);
        filters.push(`m.quote_mint = $${values.length}`);
      }

      values.push(limit, offset);
      const result = await pool.query(`
        SELECT
          m.*,
          COALESCE(s.swap_count, 0) AS swap_count,
          s.last_swap_at,
          snapshot.base_reserve AS snapshot_base_reserve,
          snapshot.quote_reserve AS snapshot_quote_reserve,
          snapshot.base_ylp_supply AS snapshot_base_ylp_supply,
          snapshot.quote_ylp_supply AS snapshot_quote_ylp_supply,
          snapshot.fixed_base_debt AS snapshot_fixed_base_debt,
          snapshot.fixed_quote_debt AS snapshot_fixed_quote_debt,
          snapshot.recognized_base_collateral_for_quote_debt AS snapshot_recognized_base_collateral_for_quote_debt,
          snapshot.recognized_quote_collateral_for_base_debt AS snapshot_recognized_quote_collateral_for_base_debt,
          snapshot.effective_base_debt_nad AS snapshot_effective_base_debt_nad,
          snapshot.effective_quote_debt_nad AS snapshot_effective_quote_debt_nad,
          snapshot.base_debt_health_bps AS snapshot_base_debt_health_bps,
          snapshot.quote_debt_health_bps AS snapshot_quote_debt_health_bps,
          snapshot.source_tx_sig AS snapshot_source_tx_sig,
          snapshot.source_slot AS snapshot_source_slot,
          snapshot.updated_at AS snapshot_updated_at
        FROM v2_markets m
        LEFT JOIN (
          SELECT market, COUNT(*) AS swap_count, MAX(timestamp) AS last_swap_at
          FROM v2_swaps
          GROUP BY market
        ) s ON s.market = m.market_address
        LEFT JOIN v2_market_snapshots snapshot ON snapshot.market = m.market_address
        ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
        ORDER BY m.updated_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);

      res.json({
        success: true,
        data: {
          markets: result.rows.map(marketRow),
          pagination: { limit, offset, count: result.rows.length },
        },
      });
    } catch (error) {
      console.error('Error fetching V2 markets:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch V2 markets' });
    }
  }

  static async getMarket(req: Request, res: Response): Promise<void> {
    try {
      const marketAddress = req.params.marketAddress;
      if (!marketAddress || !isValidAddress(marketAddress)) {
        res.status(400).json({ success: false, error: 'Valid market address is required' });
        return;
      }

      const result = await pool.query(`
        SELECT
          m.*,
          COALESCE(s.swap_count, 0) AS swap_count,
          s.last_swap_at,
          snapshot.base_reserve AS snapshot_base_reserve,
          snapshot.quote_reserve AS snapshot_quote_reserve,
          snapshot.base_ylp_supply AS snapshot_base_ylp_supply,
          snapshot.quote_ylp_supply AS snapshot_quote_ylp_supply,
          snapshot.fixed_base_debt AS snapshot_fixed_base_debt,
          snapshot.fixed_quote_debt AS snapshot_fixed_quote_debt,
          snapshot.recognized_base_collateral_for_quote_debt AS snapshot_recognized_base_collateral_for_quote_debt,
          snapshot.recognized_quote_collateral_for_base_debt AS snapshot_recognized_quote_collateral_for_base_debt,
          snapshot.effective_base_debt_nad AS snapshot_effective_base_debt_nad,
          snapshot.effective_quote_debt_nad AS snapshot_effective_quote_debt_nad,
          snapshot.base_debt_health_bps AS snapshot_base_debt_health_bps,
          snapshot.quote_debt_health_bps AS snapshot_quote_debt_health_bps,
          snapshot.source_tx_sig AS snapshot_source_tx_sig,
          snapshot.source_slot AS snapshot_source_slot,
          snapshot.updated_at AS snapshot_updated_at
        FROM v2_markets m
        LEFT JOIN (
          SELECT market, COUNT(*) AS swap_count, MAX(timestamp) AS last_swap_at
          FROM v2_swaps
          GROUP BY market
        ) s ON s.market = m.market_address
        LEFT JOIN v2_market_snapshots snapshot ON snapshot.market = m.market_address
        WHERE m.market_address = $1
      `, [marketAddress]);

      if (!result.rows.length) {
        res.status(404).json({ success: false, error: 'V2 market not found' });
        return;
      }

      res.json({ success: true, data: marketRow(result.rows[0]) });
    } catch (error) {
      console.error('Error fetching V2 market:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch V2 market' });
    }
  }

  static async getSwaps(req: Request, res: Response): Promise<void> {
    try {
      const marketAddress = req.params.marketAddress;
      if (!marketAddress || !isValidAddress(marketAddress)) {
        res.status(400).json({ success: false, error: 'Valid market address is required' });
        return;
      }
      const { limit, offset } = parseLimitOffset(req);
      const result = await pool.query(`
        SELECT *
        FROM v2_swaps
        WHERE market = $1
        ORDER BY timestamp DESC
        LIMIT $2 OFFSET $3
      `, [marketAddress, limit, offset]);

      res.json({
        success: true,
        data: {
          swaps: result.rows.map((row) => ({
            id: Number(row.id),
            market: row.market,
            trader: row.trader,
            assetInMint: row.asset_in_mint,
            assetOutMint: row.asset_out_mint,
            reserveCredit: row.reserve_credit,
            amountInAfterFee: row.amount_in_after_fee,
            amountOut: row.amount_out,
            feeCredit: row.fee_credit,
            txSig: row.tx_sig,
            slot: row.slot,
            instructionIndex: row.instruction_index,
            instructionPath: row.instruction_path,
            timestamp: row.timestamp,
          })),
          pagination: { limit, offset, count: result.rows.length },
        },
      });
    } catch (error) {
      console.error('Error fetching V2 swaps:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch V2 swaps' });
    }
  }

  static async getUserActivity(req: Request, res: Response): Promise<void> {
    try {
      const wallet = req.params.wallet;
      if (!wallet || !isValidAddress(wallet)) {
        res.status(400).json({ success: false, error: 'Valid wallet address is required' });
        return;
      }
      const { limit, offset } = parseLimitOffset(req);
      const market = req.query.market as string | undefined;
      const values: any[] = [wallet];
      let marketFilter = '';

      if (market) {
        if (!isValidAddress(market)) {
          res.status(400).json({ success: false, error: 'Valid market address is required' });
          return;
        }
        values.push(market);
        marketFilter = `AND market = $${values.length}`;
      }

      values.push(limit, offset);
      const result = await pool.query(`
        SELECT *
        FROM v2_market_events
        WHERE owner = $1 ${marketFilter}
        ORDER BY timestamp DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `, values);

      res.json({
        success: true,
        data: {
          activity: result.rows.map(eventRow),
          pagination: { limit, offset, count: result.rows.length },
        },
      });
    } catch (error) {
      console.error('Error fetching V2 user activity:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch V2 user activity' });
    }
  }

  static async getUserPositions(req: Request, res: Response): Promise<void> {
    try {
      const wallet = req.params.wallet;
      if (!wallet || !isValidAddress(wallet)) {
        res.status(400).json({ success: false, error: 'Valid wallet address is required' });
        return;
      }

      const result = await pool.query(`
        SELECT DISTINCT ON (market, owner, COALESCE(asset_mint, ''))
          market,
          owner,
          asset_mint,
          event_type,
          payload,
          tx_sig,
          slot,
          timestamp
        FROM v2_market_events
        WHERE owner = $1
          AND event_type IN (
            'liquidity_added', 'liquidity_removed', 'collateral_deposited',
            'collateral_withdrawn', 'debt_updated', 'yield_claimed',
            'yield_recipient_updated', 'hlp_opened', 'hlp_closed',
            'hlp_rebalanced', 'position_liquidated'
          )
        ORDER BY market, owner, COALESCE(asset_mint, ''), timestamp DESC
      `, [wallet]);

      res.json({
        success: true,
        data: {
          positions: result.rows.map((row) => ({
            market: row.market,
            owner: row.owner,
            assetMint: row.asset_mint,
            lastEventType: row.event_type,
            lastTxSig: row.tx_sig,
            lastSlot: row.slot,
            updatedAt: row.timestamp,
            payload: row.payload,
          })),
        },
      });
    } catch (error) {
      console.error('Error fetching V2 user positions:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch V2 user positions' });
    }
  }
}
