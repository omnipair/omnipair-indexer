import { QueryResult, QueryResultRow } from 'pg';
import { getCurrentTokenPrices } from './tokenPriceSnapshotService';
import {
  CurrentLpTokenAmounts,
  currentLpValuationKey,
  loadCurrentLpTokenAmounts,
} from './currentLpValuationService';
import {
  PriceQuality,
  TokenPrice,
  amountAwarePriceQuality,
  parseNumber,
  tokenRawToUsd,
} from '../utils/portfolioMath';

interface Queryable {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
}

export interface LiquidityPositionMetricInput {
  signer: string;
  pair: string;
  token0Mint: string;
  token1Mint: string;
  amount0: string;
  amount1: string;
  lpAmount: string;
}

export type LpUsdPriceBasis = 'historical' | 'current';

export interface LpAmountBreakdown {
  token0Amount: string;
  token1Amount: string;
  token0HistoricalUsd: string;
  token1HistoricalUsd: string;
  token0CurrentUsd: string;
  token1CurrentUsd: string;
  usd: string;
  historicalUsd: string;
  currentUsd: string;
  priceQuality: PriceQuality;
  currentPriceQuality: PriceQuality;
  priceBasis: LpUsdPriceBasis;
}

export interface LpPositionMetrics {
  earnings: {
    accruedInterest: LpAmountBreakdown;
    swapFees: LpAmountBreakdown;
    totalEarned: LpAmountBreakdown;
  };
  valueDelta: {
    currentValue: LpAmountBreakdown;
  } & ({
    netContributed: LpAmountBreakdown;
    delta: LpAmountBreakdown;
    unavailableReason?: never;
  } | {
    netContributed: null;
    delta: null;
    unavailableReason: 'transfer_history_unavailable';
  });
}

export interface LpPositionMetricsOptions {
  holdingsSource?: 'indexed' | 'wallet';
  currentPrices?: Map<string, TokenPrice>;
  currentAmountsByPosition?: Map<string, Omit<CurrentLpTokenAmounts, 'token0Amount' | 'token1Amount'> & {
    token0Amount: string | number;
    token1Amount: string | number;
  }>;
}

export type LpEarningsRange = '7D' | '30D' | '90D' | 'ALL';

export interface LpEarningsUsdSummary {
  usd: string;
  historicalUsd: string;
  currentUsd: string;
  priceQuality: PriceQuality;
  currentPriceQuality: PriceQuality;
  priceBasis: LpUsdPriceBasis;
}

export interface LpEarningsRangePosition {
  pair: string;
  signer: string;
  token0Mint: string;
  token1Mint: string;
  accruedInterest: LpAmountBreakdown;
  swapFees: LpAmountBreakdown;
  totalEarned: LpAmountBreakdown;
}

export interface LpEarningsRangeResponse {
  userAddress: string;
  range: LpEarningsRange;
  from: string | null;
  to: string;
  totals: {
    accruedInterest: LpEarningsUsdSummary;
    swapFees: LpEarningsUsdSummary;
    totalEarned: LpEarningsUsdSummary;
  };
  positions: LpEarningsRangePosition[];
}

export interface LpEarningsRangeOptions {
  range?: unknown;
  poolAddress?: string;
  now?: Date;
  currentPrices?: Map<string, TokenPrice>;
}

interface EarningsRow {
  pair: string;
  signer: string;
  accrued_interest0: string | null;
  accrued_interest1: string | null;
  swap_fees0: string | null;
  swap_fees1: string | null;
  accrued_interest_usd: string | null;
  swap_fees_usd: string | null;
  total_earned_usd: string | null;
  accrued_interest_token0_usd: string | null;
  accrued_interest_token1_usd: string | null;
  swap_fees_token0_usd: string | null;
  swap_fees_token1_usd: string | null;
  total_earned_token0_usd: string | null;
  total_earned_token1_usd: string | null;
  accrued_interest_price_quality: PriceQuality | null;
  swap_fees_price_quality: PriceQuality | null;
  total_earned_price_quality: PriceQuality | null;
}

interface ContributionRow {
  pair: string;
  signer: string;
  net_amount0: string | null;
  net_amount1: string | null;
}

interface RangeEarningsRow {
  pair: string;
  signer: string;
  token0_mint: string | null;
  token1_mint: string | null;
  accrued_interest0: string | null;
  accrued_interest1: string | null;
  swap_fees0: string | null;
  swap_fees1: string | null;
  accrued_interest_usd: string | null;
  swap_fees_usd: string | null;
  total_earned_usd: string | null;
  accrued_interest_token0_usd: string | null;
  accrued_interest_token1_usd: string | null;
  swap_fees_token0_usd: string | null;
  swap_fees_token1_usd: string | null;
  total_earned_token0_usd: string | null;
  total_earned_token1_usd: string | null;
  accrued_interest_price_quality: PriceQuality | null;
  swap_fees_price_quality: PriceQuality | null;
  total_earned_price_quality: PriceQuality | null;
}

function metricKey(signer: string, pair: string): string {
  return `${signer}:${pair}`;
}

function numericString(value: unknown): string {
  return String(parseNumber(value));
}

function normalizePriceQuality(value: unknown): PriceQuality {
  return value === 'missing' || value === 'estimated' || value === 'current' || value === 'historical'
    ? value
    : 'historical';
}

function normalizeEarningsRange(value: unknown): LpEarningsRange {
  const range = String(value || '30D').toUpperCase();
  if (range === '7D' || range === '30D' || range === '90D' || range === 'ALL') {
    return range;
  }
  return '30D';
}

function earningsRangeStart(range: LpEarningsRange, now: Date): Date | null {
  if (range === '7D') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (range === '30D') {
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  if (range === '90D') {
    return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }
  return null;
}

function combinePriceQualities(qualities: PriceQuality[]): PriceQuality {
  if (qualities.includes('missing')) {
    return 'missing';
  }
  if (qualities.includes('estimated')) {
    return 'estimated';
  }
  if (qualities.includes('current')) {
    return 'current';
  }
  return 'historical';
}

function buildUsdSummary({
  historicalUsd,
  currentUsd,
  priceQualities,
  currentPriceQualities,
}: {
  historicalUsd: number;
  currentUsd: number;
  priceQualities: PriceQuality[];
  currentPriceQualities: PriceQuality[];
}): LpEarningsUsdSummary {
  return {
    usd: numericString(historicalUsd),
    historicalUsd: numericString(historicalUsd),
    currentUsd: numericString(currentUsd),
    priceQuality: combinePriceQualities(priceQualities),
    currentPriceQuality: combinePriceQualities(currentPriceQualities),
    priceBasis: 'historical',
  };
}

function currentTokenUsdBySide(
  token0Amount: number,
  token1Amount: number,
  token0Price: TokenPrice | null | undefined,
  token1Price: TokenPrice | null | undefined
): { token0CurrentUsd: number; token1CurrentUsd: number } {
  return {
    token0CurrentUsd: tokenRawToUsd(token0Amount, token0Price),
    token1CurrentUsd: tokenRawToUsd(token1Amount, token1Price),
  };
}

function buildHistoricalBreakdown({
  token0Amount,
  token1Amount,
  historicalUsd,
  token0HistoricalUsd,
  token1HistoricalUsd,
  historicalPriceQuality,
  token0Price,
  token1Price,
}: {
  token0Amount: number;
  token1Amount: number;
  historicalUsd: number;
  token0HistoricalUsd: number;
  token1HistoricalUsd: number;
  historicalPriceQuality: PriceQuality;
  token0Price: TokenPrice | null | undefined;
  token1Price: TokenPrice | null | undefined;
}): LpAmountBreakdown {
  const { token0CurrentUsd, token1CurrentUsd } = currentTokenUsdBySide(
    token0Amount,
    token1Amount,
    token0Price,
    token1Price
  );
  const currentUsd = token0CurrentUsd + token1CurrentUsd;
  return {
    token0Amount: numericString(token0Amount),
    token1Amount: numericString(token1Amount),
    token0HistoricalUsd: numericString(token0HistoricalUsd),
    token1HistoricalUsd: numericString(token1HistoricalUsd),
    token0CurrentUsd: numericString(token0CurrentUsd),
    token1CurrentUsd: numericString(token1CurrentUsd),
    usd: numericString(historicalUsd),
    historicalUsd: numericString(historicalUsd),
    currentUsd: numericString(currentUsd),
    priceQuality: historicalPriceQuality,
    currentPriceQuality: amountAwarePriceQuality(token0Amount, token1Amount, token0Price, token1Price),
    priceBasis: 'historical',
  };
}

function buildCurrentBreakdown({
  token0Amount,
  token1Amount,
  token0Price,
  token1Price,
}: {
  token0Amount: string | number;
  token1Amount: string | number;
  token0Price: TokenPrice | null | undefined;
  token1Price: TokenPrice | null | undefined;
}): LpAmountBreakdown {
  const { token0CurrentUsd, token1CurrentUsd } = currentTokenUsdBySide(
    parseNumber(token0Amount),
    parseNumber(token1Amount),
    token0Price,
    token1Price
  );
  const currentUsd = token0CurrentUsd + token1CurrentUsd;
  const currentPriceQuality = amountAwarePriceQuality(parseNumber(token0Amount), parseNumber(token1Amount), token0Price, token1Price);
  return {
    token0Amount: String(token0Amount),
    token1Amount: String(token1Amount),
    token0HistoricalUsd: numericString(token0CurrentUsd),
    token1HistoricalUsd: numericString(token1CurrentUsd),
    token0CurrentUsd: numericString(token0CurrentUsd),
    token1CurrentUsd: numericString(token1CurrentUsd),
    usd: numericString(currentUsd),
    historicalUsd: numericString(currentUsd),
    currentUsd: numericString(currentUsd),
    priceQuality: currentPriceQuality,
    currentPriceQuality,
    priceBasis: 'current',
  };
}

async function loadEarnings(
  db: Queryable,
  positions: LiquidityPositionMetricInput[]
): Promise<Map<string, EarningsRow>> {
  if (positions.length === 0) {
    return new Map();
  }

  const signers = [...new Set(positions.map((position) => position.signer))];
  const pairs = [...new Set(positions.map((position) => position.pair))];
  const result = await db.query<EarningsRow>(
    `
      WITH quality_by_position AS (
        SELECT
          pair,
          signer,
          CASE
            WHEN BOOL_OR(source = 'borrow_interest' AND price_quality = 'missing') THEN 'missing'
            WHEN BOOL_OR(source = 'borrow_interest' AND price_quality = 'estimated') THEN 'estimated'
            WHEN BOOL_OR(source = 'borrow_interest' AND price_quality = 'current') THEN 'current'
            WHEN BOOL_OR(source = 'borrow_interest') THEN 'historical'
            ELSE 'historical'
          END AS accrued_interest_price_quality,
          CASE
            WHEN BOOL_OR(source = 'swap_fee' AND price_quality = 'missing') THEN 'missing'
            WHEN BOOL_OR(source = 'swap_fee' AND price_quality = 'estimated') THEN 'estimated'
            WHEN BOOL_OR(source = 'swap_fee' AND price_quality = 'current') THEN 'current'
            WHEN BOOL_OR(source = 'swap_fee') THEN 'historical'
            ELSE 'historical'
          END AS swap_fees_price_quality,
          CASE
            WHEN BOOL_OR(price_quality = 'missing') THEN 'missing'
            WHEN BOOL_OR(price_quality = 'estimated') THEN 'estimated'
            WHEN BOOL_OR(price_quality = 'current') THEN 'current'
            WHEN COUNT(*) > 0 THEN 'historical'
            ELSE 'historical'
          END AS total_earned_price_quality
        FROM lp_position_earning_events
        WHERE signer = ANY($1::text[])
          AND pair = ANY($2::text[])
        GROUP BY pair, signer
      ),
      event_usd_by_position AS (
        SELECT
          pair,
          signer,
          COALESCE(SUM(CASE WHEN source = 'borrow_interest' THEN token0_usd ELSE 0 END), 0) AS accrued_interest_token0_usd,
          COALESCE(SUM(CASE WHEN source = 'borrow_interest' THEN token1_usd ELSE 0 END), 0) AS accrued_interest_token1_usd,
          COALESCE(SUM(CASE WHEN source = 'swap_fee' THEN token0_usd ELSE 0 END), 0) AS swap_fees_token0_usd,
          COALESCE(SUM(CASE WHEN source = 'swap_fee' THEN token1_usd ELSE 0 END), 0) AS swap_fees_token1_usd,
          COALESCE(SUM(token0_usd), 0) AS total_earned_token0_usd,
          COALESCE(SUM(token1_usd), 0) AS total_earned_token1_usd
        FROM lp_position_earning_events
        WHERE signer = ANY($1::text[])
          AND pair = ANY($2::text[])
        GROUP BY pair, signer
      )
      SELECT pair, signer, accrued_interest0, accrued_interest1, swap_fees0, swap_fees1,
        accrued_interest_usd, swap_fees_usd, total_earned_usd,
        event_usd_by_position.accrued_interest_token0_usd,
        event_usd_by_position.accrued_interest_token1_usd,
        event_usd_by_position.swap_fees_token0_usd,
        event_usd_by_position.swap_fees_token1_usd,
        event_usd_by_position.total_earned_token0_usd,
        event_usd_by_position.total_earned_token1_usd,
        quality_by_position.accrued_interest_price_quality,
        quality_by_position.swap_fees_price_quality,
        quality_by_position.total_earned_price_quality
      FROM lp_position_earnings earnings
      LEFT JOIN quality_by_position USING (pair, signer)
      LEFT JOIN event_usd_by_position USING (pair, signer)
      WHERE earnings.signer = ANY($1::text[])
        AND earnings.pair = ANY($2::text[])
    `,
    [signers, pairs]
  );

  const byPosition = new Map<string, EarningsRow>();
  for (const row of result.rows) {
    byPosition.set(metricKey(row.signer, row.pair), row);
  }
  return byPosition;
}

async function loadNetContributions(
  db: Queryable,
  positions: LiquidityPositionMetricInput[]
): Promise<Map<string, ContributionRow>> {
  if (positions.length === 0) {
    return new Map();
  }

  const signers = [...new Set(positions.map((position) => position.signer))];
  const pairs = [...new Set(positions.map((position) => position.pair))];
  const result = await db.query<ContributionRow>(
    `
      SELECT
        pair,
        user_address AS signer,
        COALESCE(SUM(
          CASE
            WHEN event_type IN ('add', 'mint') THEN amount0::numeric
            WHEN event_type IN ('remove', 'burn') THEN -amount0::numeric
            ELSE 0
          END
        ), 0) AS net_amount0,
        COALESCE(SUM(
          CASE
            WHEN event_type IN ('add', 'mint') THEN amount1::numeric
            WHEN event_type IN ('remove', 'burn') THEN -amount1::numeric
            ELSE 0
          END
        ), 0) AS net_amount1
      FROM adjust_liquidity
      WHERE user_address = ANY($1::text[])
        AND pair = ANY($2::text[])
      GROUP BY pair, user_address
    `,
    [signers, pairs]
  );

  const byPosition = new Map<string, ContributionRow>();
  for (const row of result.rows) {
    byPosition.set(metricKey(row.signer, row.pair), row);
  }
  return byPosition;
}

export async function getUserLpEarningsForRange(
  db: Queryable,
  userAddress: string,
  options: LpEarningsRangeOptions = {}
): Promise<LpEarningsRangeResponse> {
  const range = normalizeEarningsRange(options.range);
  const to = options.now ?? new Date();
  const from = earningsRangeStart(range, to);

  const result = await db.query<RangeEarningsRow>(
    `
      SELECT
        events.pair,
        events.signer,
        pools.token0 AS token0_mint,
        pools.token1 AS token1_mint,
        COALESCE(SUM(CASE WHEN events.source = 'borrow_interest' THEN events.token0_amount ELSE 0 END), 0) AS accrued_interest0,
        COALESCE(SUM(CASE WHEN events.source = 'borrow_interest' THEN events.token1_amount ELSE 0 END), 0) AS accrued_interest1,
        COALESCE(SUM(CASE WHEN events.source = 'swap_fee' THEN events.token0_amount ELSE 0 END), 0) AS swap_fees0,
        COALESCE(SUM(CASE WHEN events.source = 'swap_fee' THEN events.token1_amount ELSE 0 END), 0) AS swap_fees1,
        COALESCE(SUM(CASE WHEN events.source = 'borrow_interest' THEN events.token0_usd ELSE 0 END), 0) AS accrued_interest_token0_usd,
        COALESCE(SUM(CASE WHEN events.source = 'borrow_interest' THEN events.token1_usd ELSE 0 END), 0) AS accrued_interest_token1_usd,
        COALESCE(SUM(CASE WHEN events.source = 'swap_fee' THEN events.token0_usd ELSE 0 END), 0) AS swap_fees_token0_usd,
        COALESCE(SUM(CASE WHEN events.source = 'swap_fee' THEN events.token1_usd ELSE 0 END), 0) AS swap_fees_token1_usd,
        COALESCE(SUM(events.token0_usd), 0) AS total_earned_token0_usd,
        COALESCE(SUM(events.token1_usd), 0) AS total_earned_token1_usd,
        COALESCE(SUM(CASE WHEN events.source = 'borrow_interest' THEN events.total_usd ELSE 0 END), 0) AS accrued_interest_usd,
        COALESCE(SUM(CASE WHEN events.source = 'swap_fee' THEN events.total_usd ELSE 0 END), 0) AS swap_fees_usd,
        COALESCE(SUM(events.total_usd), 0) AS total_earned_usd,
        CASE
          WHEN BOOL_OR(events.source = 'borrow_interest' AND events.price_quality = 'missing') THEN 'missing'
          WHEN BOOL_OR(events.source = 'borrow_interest' AND events.price_quality = 'estimated') THEN 'estimated'
          WHEN BOOL_OR(events.source = 'borrow_interest' AND events.price_quality = 'current') THEN 'current'
          WHEN BOOL_OR(events.source = 'borrow_interest') THEN 'historical'
          ELSE 'historical'
        END AS accrued_interest_price_quality,
        CASE
          WHEN BOOL_OR(events.source = 'swap_fee' AND events.price_quality = 'missing') THEN 'missing'
          WHEN BOOL_OR(events.source = 'swap_fee' AND events.price_quality = 'estimated') THEN 'estimated'
          WHEN BOOL_OR(events.source = 'swap_fee' AND events.price_quality = 'current') THEN 'current'
          WHEN BOOL_OR(events.source = 'swap_fee') THEN 'historical'
          ELSE 'historical'
        END AS swap_fees_price_quality,
        CASE
          WHEN BOOL_OR(events.price_quality = 'missing') THEN 'missing'
          WHEN BOOL_OR(events.price_quality = 'estimated') THEN 'estimated'
          WHEN BOOL_OR(events.price_quality = 'current') THEN 'current'
          WHEN COUNT(*) > 0 THEN 'historical'
          ELSE 'historical'
        END AS total_earned_price_quality
      FROM lp_position_earning_events events
      LEFT JOIN pools ON pools.pair_address = events.pair
      WHERE events.signer = $1
        AND ($2::text IS NULL OR events.pair = $2)
        AND ($3::timestamptz IS NULL OR events.event_timestamp >= $3)
        AND events.event_timestamp <= $4
      GROUP BY events.pair, events.signer, pools.token0, pools.token1
      ORDER BY MAX(events.event_timestamp) DESC, events.pair
    `,
    [userAddress, options.poolAddress ?? null, from, to]
  );

  const mints = [
    ...new Set(
      result.rows
        .flatMap((row) => [row.token0_mint, row.token1_mint])
        .filter((mint): mint is string => Boolean(mint))
    ),
  ];
  const currentPrices = options.currentPrices ?? await getCurrentTokenPrices(mints);

  const positions: LpEarningsRangePosition[] = [];
  let accruedInterestHistoricalUsd = 0;
  let accruedInterestCurrentUsd = 0;
  let swapFeesHistoricalUsd = 0;
  let swapFeesCurrentUsd = 0;
  let totalEarnedHistoricalUsd = 0;
  let totalEarnedCurrentUsd = 0;
  const accruedInterestQualities: PriceQuality[] = [];
  const swapFeesQualities: PriceQuality[] = [];
  const totalEarnedQualities: PriceQuality[] = [];
  const accruedInterestCurrentQualities: PriceQuality[] = [];
  const swapFeesCurrentQualities: PriceQuality[] = [];
  const totalEarnedCurrentQualities: PriceQuality[] = [];

  for (const row of result.rows) {
    const token0Price = row.token0_mint ? currentPrices.get(row.token0_mint) : undefined;
    const token1Price = row.token1_mint ? currentPrices.get(row.token1_mint) : undefined;

    const accruedInterest0 = parseNumber(row.accrued_interest0);
    const accruedInterest1 = parseNumber(row.accrued_interest1);
    const swapFees0 = parseNumber(row.swap_fees0);
    const swapFees1 = parseNumber(row.swap_fees1);
    const accruedInterestUsd = parseNumber(row.accrued_interest_usd);
    const swapFeesUsd = parseNumber(row.swap_fees_usd);
    const totalEarnedUsd = parseNumber(row.total_earned_usd, accruedInterestUsd + swapFeesUsd);
    const accruedInterestToken0Usd = parseNumber(row.accrued_interest_token0_usd);
    const accruedInterestToken1Usd = parseNumber(row.accrued_interest_token1_usd);
    const swapFeesToken0Usd = parseNumber(row.swap_fees_token0_usd);
    const swapFeesToken1Usd = parseNumber(row.swap_fees_token1_usd);
    const totalEarnedToken0Usd = parseNumber(
      row.total_earned_token0_usd,
      accruedInterestToken0Usd + swapFeesToken0Usd
    );
    const totalEarnedToken1Usd = parseNumber(
      row.total_earned_token1_usd,
      accruedInterestToken1Usd + swapFeesToken1Usd
    );

    const accruedInterest = buildHistoricalBreakdown({
      token0Amount: accruedInterest0,
      token1Amount: accruedInterest1,
      historicalUsd: accruedInterestUsd,
      token0HistoricalUsd: accruedInterestToken0Usd,
      token1HistoricalUsd: accruedInterestToken1Usd,
      historicalPriceQuality: normalizePriceQuality(row.accrued_interest_price_quality),
      token0Price,
      token1Price,
    });
    const swapFees = buildHistoricalBreakdown({
      token0Amount: swapFees0,
      token1Amount: swapFees1,
      historicalUsd: swapFeesUsd,
      token0HistoricalUsd: swapFeesToken0Usd,
      token1HistoricalUsd: swapFeesToken1Usd,
      historicalPriceQuality: normalizePriceQuality(row.swap_fees_price_quality),
      token0Price,
      token1Price,
    });
    const totalEarned = buildHistoricalBreakdown({
      token0Amount: accruedInterest0 + swapFees0,
      token1Amount: accruedInterest1 + swapFees1,
      historicalUsd: totalEarnedUsd,
      token0HistoricalUsd: totalEarnedToken0Usd,
      token1HistoricalUsd: totalEarnedToken1Usd,
      historicalPriceQuality: normalizePriceQuality(row.total_earned_price_quality),
      token0Price,
      token1Price,
    });

    positions.push({
      pair: row.pair,
      signer: row.signer,
      token0Mint: row.token0_mint ?? '',
      token1Mint: row.token1_mint ?? '',
      accruedInterest,
      swapFees,
      totalEarned,
    });

    accruedInterestHistoricalUsd += accruedInterestUsd;
    accruedInterestCurrentUsd += parseNumber(accruedInterest.currentUsd);
    swapFeesHistoricalUsd += swapFeesUsd;
    swapFeesCurrentUsd += parseNumber(swapFees.currentUsd);
    totalEarnedHistoricalUsd += totalEarnedUsd;
    totalEarnedCurrentUsd += parseNumber(totalEarned.currentUsd);
    accruedInterestQualities.push(accruedInterest.priceQuality);
    swapFeesQualities.push(swapFees.priceQuality);
    totalEarnedQualities.push(totalEarned.priceQuality);
    accruedInterestCurrentQualities.push(accruedInterest.currentPriceQuality);
    swapFeesCurrentQualities.push(swapFees.currentPriceQuality);
    totalEarnedCurrentQualities.push(totalEarned.currentPriceQuality);
  }

  return {
    userAddress,
    range,
    from: from ? from.toISOString() : null,
    to: to.toISOString(),
    totals: {
      accruedInterest: buildUsdSummary({
        historicalUsd: accruedInterestHistoricalUsd,
        currentUsd: accruedInterestCurrentUsd,
        priceQualities: accruedInterestQualities,
        currentPriceQualities: accruedInterestCurrentQualities,
      }),
      swapFees: buildUsdSummary({
        historicalUsd: swapFeesHistoricalUsd,
        currentUsd: swapFeesCurrentUsd,
        priceQualities: swapFeesQualities,
        currentPriceQualities: swapFeesCurrentQualities,
      }),
      totalEarned: buildUsdSummary({
        historicalUsd: totalEarnedHistoricalUsd,
        currentUsd: totalEarnedCurrentUsd,
        priceQualities: totalEarnedQualities,
        currentPriceQualities: totalEarnedCurrentQualities,
      }),
    },
    positions,
  };
}

export async function getLpPositionMetricsForRows(
  db: Queryable,
  positions: LiquidityPositionMetricInput[],
  options: LpPositionMetricsOptions = {}
): Promise<Map<string, LpPositionMetrics>> {
  // Deposit/withdrawal events cannot establish the contribution basis of live
  // holdings without transfer history, even when live and indexed balances match.
  const useIndexedContributions = options.holdingsSource !== 'wallet';
  const [earningsByPosition, contributionsByPosition, currentPrices] = await Promise.all([
    loadEarnings(db, positions),
    useIndexedContributions ? loadNetContributions(db, positions) : new Map<string, ContributionRow>(),
    options.currentPrices
      ? Promise.resolve(options.currentPrices)
      : getCurrentTokenPrices(positions.flatMap((position) => [position.token0Mint, position.token1Mint])),
  ]);
  const currentAmountsByPosition = options.currentAmountsByPosition
    ?? await loadCurrentLpTokenAmounts(
      positions.map((position) => ({
        signer: position.signer,
        pair: position.pair,
        lpAmount: position.lpAmount,
        amount0: position.amount0,
        amount1: position.amount1,
      }))
    );

  const metrics = new Map<string, LpPositionMetrics>();
  for (const position of positions) {
    const key = metricKey(position.signer, position.pair);
    const earnings = earningsByPosition.get(key);
    const contribution = contributionsByPosition.get(key);
    const token0Price = currentPrices.get(position.token0Mint);
    const token1Price = currentPrices.get(position.token1Mint);

    const netToken0 = parseNumber(contribution?.net_amount0);
    const netToken1 = parseNumber(contribution?.net_amount1);
    const currentAmounts = currentAmountsByPosition.get(currentLpValuationKey(position.signer, position.pair));
    const currentToken0 = currentAmounts?.token0Amount ?? parseNumber(position.amount0);
    const currentToken1 = currentAmounts?.token1Amount ?? parseNumber(position.amount1);

    const accruedInterest0 = parseNumber(earnings?.accrued_interest0);
    const accruedInterest1 = parseNumber(earnings?.accrued_interest1);
    const swapFees0 = parseNumber(earnings?.swap_fees0);
    const swapFees1 = parseNumber(earnings?.swap_fees1);
    const accruedInterestUsd = parseNumber(earnings?.accrued_interest_usd);
    const swapFeesUsd = parseNumber(earnings?.swap_fees_usd);
    const totalEarnedUsd = parseNumber(earnings?.total_earned_usd, accruedInterestUsd + swapFeesUsd);
    const accruedInterestToken0Usd = parseNumber(earnings?.accrued_interest_token0_usd);
    const accruedInterestToken1Usd = parseNumber(earnings?.accrued_interest_token1_usd);
    const swapFeesToken0Usd = parseNumber(earnings?.swap_fees_token0_usd);
    const swapFeesToken1Usd = parseNumber(earnings?.swap_fees_token1_usd);
    const totalEarnedToken0Usd = parseNumber(
      earnings?.total_earned_token0_usd,
      accruedInterestToken0Usd + swapFeesToken0Usd
    );
    const totalEarnedToken1Usd = parseNumber(
      earnings?.total_earned_token1_usd,
      accruedInterestToken1Usd + swapFeesToken1Usd
    );

    metrics.set(key, {
      earnings: {
        accruedInterest: buildHistoricalBreakdown({
          token0Amount: accruedInterest0,
          token1Amount: accruedInterest1,
          historicalUsd: accruedInterestUsd,
          token0HistoricalUsd: accruedInterestToken0Usd,
          token1HistoricalUsd: accruedInterestToken1Usd,
          historicalPriceQuality: normalizePriceQuality(earnings?.accrued_interest_price_quality),
          token0Price,
          token1Price,
        }),
        swapFees: buildHistoricalBreakdown({
          token0Amount: swapFees0,
          token1Amount: swapFees1,
          historicalUsd: swapFeesUsd,
          token0HistoricalUsd: swapFeesToken0Usd,
          token1HistoricalUsd: swapFeesToken1Usd,
          historicalPriceQuality: normalizePriceQuality(earnings?.swap_fees_price_quality),
          token0Price,
          token1Price,
        }),
        totalEarned: buildHistoricalBreakdown({
          token0Amount: accruedInterest0 + swapFees0,
          token1Amount: accruedInterest1 + swapFees1,
          historicalUsd: totalEarnedUsd,
          token0HistoricalUsd: totalEarnedToken0Usd,
          token1HistoricalUsd: totalEarnedToken1Usd,
          historicalPriceQuality: normalizePriceQuality(earnings?.total_earned_price_quality),
          token0Price,
          token1Price,
        }),
      },
      valueDelta: {
        currentValue: buildCurrentBreakdown({
          token0Amount: currentToken0,
          token1Amount: currentToken1,
          token0Price,
          token1Price,
        }),
        ...(useIndexedContributions ? {
          netContributed: buildCurrentBreakdown({
            token0Amount: netToken0,
            token1Amount: netToken1,
            token0Price,
            token1Price,
          }),
          delta: buildCurrentBreakdown({
            token0Amount: parseNumber(currentToken0) - netToken0,
            token1Amount: parseNumber(currentToken1) - netToken1,
            token0Price,
            token1Price,
          }),
        } : {
          netContributed: null,
          delta: null,
          unavailableReason: 'transfer_history_unavailable' as const,
        }),
      },
    });
  }

  return metrics;
}

export function getLpPositionMetricKey(signer: string, pair: string): string {
  return metricKey(signer, pair);
}
