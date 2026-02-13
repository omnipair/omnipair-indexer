/**
 * Backfill Volume USD Script
 * 
 * One-time / on-demand script to retroactively fill volume_usd for existing swaps
 * that don't have a USD volume value yet.
 * 
 * Note: Jupiter Price API returns CURRENT prices, not historical. For recent swaps
 * this is a reasonable approximation. For old swaps the prices may be inaccurate.
 * 
 * Usage:
 *   npx ts-node api/src/scripts/backfillVolume.ts
 *   npx ts-node api/src/scripts/backfillVolume.ts --pair <PAIR_ADDRESS>  # backfill specific pair only
 *   npx ts-node api/src/scripts/backfillVolume.ts --limit 1000          # limit number of swaps
 * 
 * Environment Variables:
 *   DATABASE_URL              - PostgreSQL connection string (required)
 *   JUPITER_API_URL           - Jupiter API base URL (default: https://api.jup.ag)
 *   JUPITER_API_KEY           - Jupiter API key for higher rate limits (optional)
 *   JUPITER_TIMEOUT_MS        - Jupiter API request timeout in ms (default: 5000)
 *   BACKFILL_BATCH_SIZE       - Number of swaps per batch (default: 50)
 *   BACKFILL_DELAY_MS         - Delay between batches in ms (default: 1000)
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// --- Configuration (all overridable via environment variables) ---

const JUPITER_API_URL = process.env.JUPITER_API_URL || 'https://api.jup.ag';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const JUPITER_TIMEOUT_MS = parseInt(process.env.JUPITER_TIMEOUT_MS || '5000', 10);
const BATCH_SIZE = parseInt(process.env.BACKFILL_BATCH_SIZE || '50', 10);
const DELAY_BETWEEN_BATCHES_MS = parseInt(process.env.BACKFILL_DELAY_MS || '1000', 10);

// --- Price Cache (longer TTL for backfill since we're batch processing) ---

interface PriceInfo {
  price: number;
  decimals: number;
}

const priceCache = new Map<string, PriceInfo | null>();

/**
 * Fetch prices for multiple mints in a single Jupiter V3 API call.
 * Results are cached individually.
 */
async function fetchTokenPrices(mints: string[]): Promise<Map<string, PriceInfo>> {
  const results = new Map<string, PriceInfo>();
  const uncachedMints: string[] = [];

  for (const mint of mints) {
    if (priceCache.has(mint)) {
      const cached = priceCache.get(mint);
      if (cached) results.set(mint, cached);
    } else {
      uncachedMints.push(mint);
    }
  }

  if (uncachedMints.length === 0) return results;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JUPITER_TIMEOUT_MS);

    const headers: Record<string, string> = {};
    if (JUPITER_API_KEY) {
      headers['x-api-key'] = JUPITER_API_KEY;
    }

    const ids = uncachedMints.join(',');
    const response = await fetch(`${JUPITER_API_URL}/price/v3?ids=${ids}`, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`Jupiter Price V3 returned ${response.status} for mints: ${ids}`);
      return results;
    }

    // V3 response: { "MINT1": { "usdPrice": 147.47, "decimals": 9 }, ... }
    const data = await response.json() as any;

    for (const mint of uncachedMints) {
      const tokenData = data?.[mint];
      if (tokenData && tokenData.usdPrice && !isNaN(tokenData.usdPrice) && tokenData.usdPrice > 0) {
        const info: PriceInfo = { price: tokenData.usdPrice, decimals: tokenData.decimals ?? 6 };
        priceCache.set(mint, info);
        results.set(mint, info);
      } else {
        priceCache.set(mint, null);
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`Jupiter Price V3 timeout for mints: ${uncachedMints.join(',')}`);
    } else {
      console.error(`Error fetching prices:`, error.message);
    }
  }

  return results;
}

// --- Pool Info ---

interface PoolInfo {
  token0: string;
  token1: string;
}

const poolInfoCache = new Map<string, PoolInfo>();

async function getPoolInfo(pool: Pool, pairAddress: string): Promise<PoolInfo | null> {
  const cached = poolInfoCache.get(pairAddress);
  if (cached) return cached;

  const result = await pool.query(
    'SELECT token0, token1 FROM pools WHERE pair_address = $1',
    [pairAddress]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const info: PoolInfo = {
    token0: row.token0,
    token1: row.token1,
  };

  poolInfoCache.set(pairAddress, info);
  return info;
}

// --- Main ---

async function main(): Promise<void> {
  // Parse CLI args
  const args = process.argv.slice(2);
  let pairFilter: string | null = null;
  let maxLimit: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pair' && args[i + 1]) {
      pairFilter = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      maxLimit = parseInt(args[i + 1]);
      i++;
    }
  }

  console.log('=== Omnipair Volume USD Backfill ===');
  if (pairFilter) console.log(`Filtering by pair: ${pairFilter}`);
  if (maxLimit) console.log(`Max swaps to process: ${maxLimit}`);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Count swaps needing backfill
  let countQuery = 'SELECT COUNT(*) FROM swaps WHERE volume_usd IS NULL';
  const countParams: any[] = [];
  if (pairFilter) {
    countQuery += ' AND pair = $1';
    countParams.push(pairFilter);
  }

  const countResult = await pool.query(countQuery, countParams);
  const totalCount = parseInt(countResult.rows[0].count);
  console.log(`Swaps needing backfill: ${totalCount}`);

  if (totalCount === 0) {
    console.log('Nothing to backfill. Done.');
    await pool.end();
    return;
  }

  const toProcess = maxLimit ? Math.min(totalCount, maxLimit) : totalCount;
  let processed = 0;
  let enriched = 0;
  let failed = 0;

  while (processed < toProcess) {
    // Fetch a batch of swaps without volume_usd
    let query = `
      SELECT id, pair, is_token0_in, amount_in, amount_out, tx_sig, "timestamp"
      FROM swaps
      WHERE volume_usd IS NULL
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (pairFilter) {
      query += ` AND pair = $${paramIdx}`;
      params.push(pairFilter);
      paramIdx++;
    }

    query += ` ORDER BY "timestamp" DESC LIMIT $${paramIdx}`;
    params.push(BATCH_SIZE);

    const result = await pool.query(query, params);

    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      const poolInfo = await getPoolInfo(pool, row.pair);
      if (!poolInfo) {
        console.warn(`Skipping swap ${row.tx_sig}: no pool info for ${row.pair}`);
        failed++;
        processed++;
        continue;
      }

      // Fetch both token prices in a single API call
      const tokenInMint = row.is_token0_in ? poolInfo.token0 : poolInfo.token1;
      const tokenOutMint = row.is_token0_in ? poolInfo.token1 : poolInfo.token0;
      const prices = await fetchTokenPrices([tokenInMint, tokenOutMint]);
      let volumeUsd = 0;

      // Prefer input token price
      const tokenInPrice = prices.get(tokenInMint);
      if (tokenInPrice) {
        const humanAmount = parseFloat(row.amount_in) / Math.pow(10, tokenInPrice.decimals);
        volumeUsd = humanAmount * tokenInPrice.price;
      } else {
        // Fallback: use output token price
        const tokenOutPrice = prices.get(tokenOutMint);
        if (tokenOutPrice) {
          const humanAmount = parseFloat(row.amount_out) / Math.pow(10, tokenOutPrice.decimals);
          volumeUsd = humanAmount * tokenOutPrice.price;
        }
      }

      await pool.query(
        'UPDATE swaps SET volume_usd = $1 WHERE tx_sig = $2',
        [volumeUsd, row.tx_sig]
      );

      processed++;
      if (volumeUsd > 0) enriched++;
      else failed++;

      if (processed % 100 === 0) {
        console.log(`Progress: ${processed}/${toProcess} (enriched: ${enriched}, no price: ${failed})`);
      }
    }

    // Rate limit between batches
    if (processed < toProcess) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  console.log(`\nBackfill complete:`);
  console.log(`  Total processed: ${processed}`);
  console.log(`  Enriched with USD volume: ${enriched}`);
  console.log(`  No price available: ${failed}`);

  await pool.end();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
