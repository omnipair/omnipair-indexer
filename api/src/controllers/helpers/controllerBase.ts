import pool from '../../config/database';
import { cache } from '../../utils/cache';
import { PairStateService, PairState } from '../../services/PairStateService';
import { loadOmnipairIdl } from '../../config/idl-loader';
import { fetchTokenPrices } from '../../services/jupiterPriceService';
import type { PairAccount } from '../../utils/pairSimulation';

export const KNOWN_TOKEN_ICONS: Record<string, string> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  'So11111111111111111111111111111111111111112': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
};

const SOLANA_ADDRESS_RE = /^[A-Za-z0-9]{32,44}$/;

export function isValidAddress(addr: string): boolean {
  return SOLANA_ADDRESS_RE.test(addr);
}

let pairStateService: PairStateService | null = null;

export async function initializePairStateService(): Promise<PairStateService> {
  if (pairStateService) {
    return pairStateService;
  }

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const service = new PairStateService(rpcUrl);

  try {
    const idl = loadOmnipairIdl();
    service.initializeProgram(idl);
    pairStateService = service;
    return service;
  } catch (error) {
    console.error('Error initializing PairStateService:', error);
    throw error;
  }
}

export async function fetchCachedPairState(
  pairService: PairStateService,
  pairAddress: string,
  loadPairAccount?: () => Promise<PairAccount | null>
): Promise<PairState> {
  return cache.getOrSet(`pair_state_${pairAddress}`, 5 * 1000, async () =>
    pairService.fetchPairState(pairAddress, loadPairAccount ? await loadPairAccount() : undefined)
  );
}

export async function calculateAPR(pairAddress: string): Promise<{
  apr: number;
  apr_breakdown: {
    swap_apr: number;
    interest_apr: number;
  };
}> {
  return cache.getOrSet(`apr_calc_${pairAddress}`, 5 * 60 * 1000, async () => {
    const now = Math.floor(Date.now() / 1000);
    const week = 7 * 24 * 60 * 60;
    const cutoff = now - week;

    const [swapResult, interestResult] = await Promise.all([
      pool.query(`
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
      `, [cutoff, pairAddress]),
      pool.query(`
        SELECT 
          SUM(lp_interest0::numeric) as weekly_lp_interest0,
          SUM(lp_interest1::numeric) as weekly_lp_interest1,
          AVG(reserve0_after_interest::numeric) as avg_reserve0,
          AVG(reserve1_after_interest::numeric) as avg_reserve1
        FROM update_pair_events 
        WHERE timestamp > to_timestamp($1) 
          AND pair = $2
      `, [cutoff, pairAddress]),
    ]);

    let swapAPR = 0;
    let swapToken0APR = 0;
    let swapToken1APR = 0;

    if (swapResult.rows.length > 0) {
      const row = swapResult.rows[0];
      const weeklyFee0 = parseFloat(row.weekly_fee0 || '0');
      const weeklyFee1 = parseFloat(row.weekly_fee1 || '0');
      const avgReserve0 = parseFloat(row.avg_reserve0 || '0');
      const avgReserve1 = parseFloat(row.avg_reserve1 || '0');

      const dailyFee0 = weeklyFee0 / 7;
      const dailyFee1 = weeklyFee1 / 7;
      swapToken0APR = avgReserve0 > 0 ? (dailyFee0 / (avgReserve0 * 2)) * 365 * 100 : 0;
      swapToken1APR = avgReserve1 > 0 ? (dailyFee1 / (avgReserve1 * 2)) * 365 * 100 : 0;
      swapAPR = (swapToken0APR + swapToken1APR) / 2;
    }

    let interestAPR = 0;
    let interestToken0APR = 0;
    let interestToken1APR = 0;

    if (interestResult.rows.length > 0) {
      const row = interestResult.rows[0];
      const weeklyInterest0 = parseFloat(row.weekly_lp_interest0 || '0');
      const weeklyInterest1 = parseFloat(row.weekly_lp_interest1 || '0');
      const avgReserve0 = parseFloat(row.avg_reserve0 || '0');
      const avgReserve1 = parseFloat(row.avg_reserve1 || '0');

      const dailyInterest0 = weeklyInterest0 / 7;
      const dailyInterest1 = weeklyInterest1 / 7;
      interestToken0APR = avgReserve0 > 0 ? (dailyInterest0 / (avgReserve0 * 2)) * 365 * 100 : 0;
      interestToken1APR = avgReserve1 > 0 ? (dailyInterest1 / (avgReserve1 * 2)) * 365 * 100 : 0;
      interestAPR = interestToken0APR + interestToken1APR;
    }

    return {
      apr: swapAPR + interestAPR,
      apr_breakdown: {
        swap_apr: swapAPR,
        interest_apr: interestAPR
      }
    };
  });
}

function rawAmountToUsd(raw: string, mint: string, prices: Awaited<ReturnType<typeof fetchTokenPrices>>): number {
  const price = prices.get(mint);
  if (!price) {
    return 0;
  }
  return (parseFloat(raw) / Math.pow(10, price.decimals)) * price.price;
}

export async function calculateTotalFeesPaid(pairAddress: string, hours?: number): Promise<{
  total_fees_usd: string;
  lp_fees_usd: string;
  protocol_fees_usd: string;
  token0_fees: string;
  token1_fees: string;
  total_interest: string;
  period: string;
}> {
  const cacheKey = `fees_calc_${pairAddress}_${hours ? `${hours}hrs` : 'all'}`;

  return cache.getOrSet(cacheKey, 60 * 1000, async () => {
    let feesQuery: string;
    let interestQuery: string;
    let queryParams: any[];
    let period: string;

    if (hours !== undefined && hours !== null) {
      const now = Math.floor(Date.now() / 1000);
      const timestamp = now - (hours * 60 * 60);

      feesQuery = `
        SELECT 
          COALESCE(SUM(COALESCE(lp_fee_usd, 0) + COALESCE(protocol_fee_usd, 0)), 0) as total_fees_usd,
          COALESCE(SUM(COALESCE(lp_fee_usd, 0)), 0) as lp_fees_usd,
          COALESCE(SUM(COALESCE(protocol_fee_usd, 0)), 0) as protocol_fees_usd,
          COALESCE(SUM(CASE WHEN is_token0_in = true THEN fee_paid0::numeric ELSE 0 END), 0) as token0_fees,
          COALESCE(SUM(CASE WHEN is_token0_in = false THEN fee_paid1::numeric ELSE 0 END), 0) as token1_fees
        FROM swaps 
        WHERE timestamp > to_timestamp($1) AND pair = $2
      `;
      interestQuery = `
        SELECT
          p.token0,
          p.token1,
          COALESCE(SUM(e.accrued_interest0), 0) AS accrued0,
          COALESCE(SUM(e.accrued_interest1), 0) AS accrued1
        FROM pools p
        LEFT JOIN update_pair_events e
          ON e.pair = p.pair_address
         AND e.timestamp > to_timestamp($1)
        WHERE p.pair_address = $2
        GROUP BY p.token0, p.token1
      `;
      queryParams = [timestamp, pairAddress];
      period = hours === 24 ? '24hrs' : `${hours}hrs`;
    } else {
      feesQuery = `
        SELECT 
          COALESCE(SUM(COALESCE(lp_fee_usd, 0) + COALESCE(protocol_fee_usd, 0)), 0) as total_fees_usd,
          COALESCE(SUM(COALESCE(lp_fee_usd, 0)), 0) as lp_fees_usd,
          COALESCE(SUM(COALESCE(protocol_fee_usd, 0)), 0) as protocol_fees_usd,
          COALESCE(SUM(CASE WHEN is_token0_in = true THEN fee_paid0::numeric ELSE 0 END), 0) as token0_fees,
          COALESCE(SUM(CASE WHEN is_token0_in = false THEN fee_paid1::numeric ELSE 0 END), 0) as token1_fees
        FROM swaps 
        WHERE pair = $1
      `;
      interestQuery = `
        SELECT
          p.token0,
          p.token1,
          COALESCE(SUM(e.accrued_interest0), 0) AS accrued0,
          COALESCE(SUM(e.accrued_interest1), 0) AS accrued1
        FROM pools p
        LEFT JOIN update_pair_events e ON e.pair = p.pair_address
        WHERE p.pair_address = $1
        GROUP BY p.token0, p.token1
      `;
      queryParams = [pairAddress];
      period = 'all';
    }

    const [feesResult, interestResult] = await Promise.all([
      pool.query(feesQuery, queryParams),
      pool.query(interestQuery, queryParams),
    ]);
    const row = feesResult.rows[0];
    const interestRow = interestResult.rows[0];

    let totalInterestUsd = 0;
    if (interestRow) {
      const prices = await fetchTokenPrices([interestRow.token0, interestRow.token1]);
      totalInterestUsd =
        rawAmountToUsd(String(interestRow.accrued0), interestRow.token0, prices) +
        rawAmountToUsd(String(interestRow.accrued1), interestRow.token1, prices);
    }

    return {
      total_fees_usd: String(row.total_fees_usd),
      lp_fees_usd: String(row.lp_fees_usd),
      protocol_fees_usd: String(row.protocol_fees_usd),
      token0_fees: String(row.token0_fees),
      token1_fees: String(row.token1_fees),
      total_interest: String(totalInterestUsd),
      period
    };
  });
}

export async function calculateSwapVolume(pairAddress: string, hours: number = 24): Promise<{
  volume0: string;
  volume1: string;
  volumeUsd: string;
  period: string;
}> {
  return cache.getOrSet(`swap_volume_calc_${pairAddress}_${hours}hrs`, 10 * 1000, async () => {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = now - (hours * 60 * 60);

    const result = await pool.query(`
      SELECT 
        SUM(CASE WHEN is_token0_in = true THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume0,
        SUM(CASE WHEN is_token0_in = false THEN amount_in::numeric ELSE amount_out::numeric END) as total_volume1,
        SUM(COALESCE(volume_usd, 0)) as total_volume_usd
      FROM swaps 
      WHERE timestamp > to_timestamp($1) AND pair = $2
    `, [timestamp, pairAddress]);

    return {
      volume0: result.rows[0].total_volume0 || '0',
      volume1: result.rows[0].total_volume1 || '0',
      volumeUsd: result.rows[0].total_volume_usd || '0',
      period: `${hours}hrs`
    };
  });
}

/**
 * Split a position into two separate token positions:
 * 1. Position with collateral0 and debt1 (token0 collateral, token1 debt)
 * 2. Position with collateral1 and debt0 (token1 collateral, token0 debt)
 * 
 * Returns positions if collateral > 0, regardless of debt amount.
 */
export function splitPosition(position: any): Array<any> {
  const positions: any[] = [];

  // On-chain simulation returns (value0, value1) mapped to { token0, token1 }:
  //   Collateral-indexed: value0 = token0 as collateral, value1 = token1 as collateral
  //     → liquidationBorrowLimit, collateralValueWithImpact, isLiquidatable
  //   Debt-indexed: value0 = token0 as debt, value1 = token1 as debt
  //     → dynamicBorrowLimit, debtWithInterest, liquidationPrice
  if (position.collateral0 && position.collateral0 !== '0') {
    positions.push({
      signer: position.signer,
      pair: position.pair,
      position: position.position,
      collateralToken: 'token0',
      debtToken: 'token1',
      collateral: position.collateral0,
      debtShares: position.debt1_shares || '0',
      token0Address: position.token0Address || null,
      token1Address: position.token1Address || null,
      collateralFactors: {
        liquidation: position.collateral0_liquidation_cf_bps,
        max: position.collateral0_max_cf_bps,
      },
      borrowLimits: {
        liquidation: position.liquidationBorrowLimit?.token0 || null,
        dynamic: position.dynamicBorrowLimit?.token1 || null,
      },
      health: {
        debtWithInterest: position.debtWithInterest?.token1 || null,
        collateralValueWithImpact: position.collateralValueWithImpact?.token0 || null,
        liquidationPrice: position.liquidationPrice?.token1 || null,
      },
      event_timestamp: position.event_timestamp,
    });
  }

  if (position.collateral1 && position.collateral1 !== '0') {
    positions.push({
      signer: position.signer,
      pair: position.pair,
      position: position.position,
      collateralToken: 'token1',
      debtToken: 'token0',
      collateral: position.collateral1,
      debtShares: position.debt0_shares || '0',
      token0Address: position.token0Address || null,
      token1Address: position.token1Address || null,
      collateralFactors: {
        liquidation: position.collateral1_liquidation_cf_bps,
        max: position.collateral1_max_cf_bps,
      },
      borrowLimits: {
        liquidation: position.liquidationBorrowLimit?.token1 || null,
        dynamic: position.dynamicBorrowLimit?.token0 || null,
      },
      health: {
        debtWithInterest: position.debtWithInterest?.token0 || null,
        collateralValueWithImpact: position.collateralValueWithImpact?.token1 || null,
        liquidationPrice: position.liquidationPrice?.token0 || null,
      },
      event_timestamp: position.event_timestamp,
    });
  }

  return positions;
}
