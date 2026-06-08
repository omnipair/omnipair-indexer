import { QueryResult, QueryResultRow } from 'pg';

export const BORROW_RATE_HISTORY_RANGES = ['1H', '2H', '4H', '12H', '24H', '7D', '30D'] as const;

export type BorrowRateHistoryRange = typeof BORROW_RATE_HISTORY_RANGES[number];

export interface Queryable {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
}

export interface BorrowRateHistoryPoint {
  timestamp: string;
  slot: string | null;
  transactionSignature: string;
  token0RatePct: number;
  token1RatePct: number;
  source: 'update_pair_events';
}

export interface BorrowRateControllerParams {
  targetUtilStartPct: number | null;
  targetUtilEndPct: number | null;
  halfLifeMs: number | null;
  minRatePct: number | null;
  maxRatePct: number | null;
  initialRatePct: number | null;
}

export interface BorrowRateHistoryResponse {
  pairAddress: string;
  range: BorrowRateHistoryRange;
  windowHours: number;
  bucketSeconds: number;
  generatedAt: string;
  source: 'update_pair_events';
  controller: BorrowRateControllerParams | null;
  points: BorrowRateHistoryPoint[];
}

interface BorrowRateHistoryRow {
  rate0: string;
  rate1: string;
  timestamp: Date | string;
  slot: string | null;
  transaction_signature: string;
}

interface ControllerRow {
  target_util_start_bps: string | null;
  target_util_end_bps: string | null;
  rate_half_life_ms: string | null;
  min_rate_bps: string | null;
  max_rate_bps: string | null;
}

interface RangeConfig {
  range: BorrowRateHistoryRange;
  windowHours: number;
  bucketSeconds: number;
}

const RANGE_CONFIGS: Record<BorrowRateHistoryRange, RangeConfig> = {
  '1H': { range: '1H', windowHours: 1, bucketSeconds: 5 * 60 },
  '2H': { range: '2H', windowHours: 2, bucketSeconds: 5 * 60 },
  '4H': { range: '4H', windowHours: 4, bucketSeconds: 5 * 60 },
  '12H': { range: '12H', windowHours: 12, bucketSeconds: 5 * 60 },
  '24H': { range: '24H', windowHours: 24, bucketSeconds: 5 * 60 },
  '7D': { range: '7D', windowHours: 7 * 24, bucketSeconds: 60 * 60 },
  '30D': { range: '30D', windowHours: 30 * 24, bucketSeconds: 4 * 60 * 60 },
};

export function normalizeBorrowRateHistoryRange(range?: string | null): RangeConfig {
  const normalized = (range || '24H').toUpperCase() as BorrowRateHistoryRange;
  if (!BORROW_RATE_HISTORY_RANGES.includes(normalized)) {
    throw new Error(`Unsupported range. Must be one of: ${BORROW_RATE_HISTORY_RANGES.join(', ')}`);
  }

  return RANGE_CONFIGS[normalized];
}

export async function getBorrowRateHistory(
  db: Queryable,
  pairAddress: string,
  options: { range?: string | null; now?: Date } = {}
): Promise<BorrowRateHistoryResponse> {
  const config = normalizeBorrowRateHistoryRange(options.range);
  const now = options.now ?? new Date();
  const start = new Date(now.getTime() - config.windowHours * 60 * 60 * 1000);

  const [historyRows, controller] = await Promise.all([
    fetchRateHistoryRows(db, pairAddress, start, config.bucketSeconds),
    fetchControllerParams(db, pairAddress),
  ]);

  return {
    pairAddress,
    range: config.range,
    windowHours: config.windowHours,
    bucketSeconds: config.bucketSeconds,
    generatedAt: now.toISOString(),
    source: 'update_pair_events',
    controller,
    points: historyRows.map(mapHistoryRow),
  };
}

async function fetchRateHistoryRows(
  db: Queryable,
  pairAddress: string,
  start: Date,
  bucketSeconds: number
): Promise<BorrowRateHistoryRow[]> {
  const result = await db.query<BorrowRateHistoryRow>(
    `
      WITH filtered AS (
        SELECT
          rate0::text,
          rate1::text,
          "timestamp",
          slot::text,
          transaction_signature,
          floor(extract(epoch FROM "timestamp") / $3::numeric) AS bucket
        FROM update_pair_events
        WHERE pair = $1
          AND "timestamp" >= $2
      ),
      ranked AS (
        SELECT
          *,
          row_number() OVER (
            PARTITION BY bucket
            ORDER BY "timestamp" DESC, slot DESC, transaction_signature DESC
          ) AS bucket_rank
        FROM filtered
      )
      SELECT
        rate0,
        rate1,
        "timestamp",
        slot,
        transaction_signature
      FROM ranked
      WHERE bucket_rank = 1
      ORDER BY "timestamp" ASC, slot ASC
    `,
    [pairAddress, start, bucketSeconds]
  );

  return result.rows;
}

async function fetchControllerParams(
  db: Queryable,
  pairAddress: string
): Promise<BorrowRateControllerParams | null> {
  const result = await db.query<ControllerRow>(
    `
      SELECT
        target_util_start_bps::text,
        target_util_end_bps::text,
        rate_half_life_ms::text,
        min_rate_bps::text,
        max_rate_bps::text
      FROM pools
      WHERE pair_address = $1
      LIMIT 1
    `,
    [pairAddress]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    targetUtilStartPct: bpsToPct(row.target_util_start_bps),
    targetUtilEndPct: bpsToPct(row.target_util_end_bps),
    halfLifeMs: parseFiniteNumber(row.rate_half_life_ms),
    minRatePct: bpsToPct(row.min_rate_bps),
    maxRatePct: bpsToPct(row.max_rate_bps, { zeroAsNull: true }),
    initialRatePct: null,
  };
}

function mapHistoryRow(row: BorrowRateHistoryRow): BorrowRateHistoryPoint {
  return {
    timestamp: new Date(row.timestamp).toISOString(),
    slot: row.slot,
    transactionSignature: row.transaction_signature,
    token0RatePct: rawRateToPct(row.rate0),
    token1RatePct: rawRateToPct(row.rate1),
    source: 'update_pair_events',
  };
}

export function rawRateToPct(rawRate: string | number | null | undefined): number {
  const parsed = parseFiniteNumber(rawRate);
  return parsed === null ? 0 : parsed / 1e7;
}

function bpsToPct(
  value: string | number | null | undefined,
  options: { zeroAsNull?: boolean } = {}
): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || (options.zeroAsNull && parsed === 0)) {
    return null;
  }
  return parsed / 100;
}

function parseFiniteNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
