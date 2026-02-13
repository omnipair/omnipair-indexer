/**
 * Volume Enricher Sidecar
 * 
 * A long-running process that listens for new swap INSERTs via PostgreSQL NOTIFY,
 * fetches USD token prices from Jupiter Price API V3, and UPDATEs the swap with volume_usd.
 * 
 * The GRPC server holds INSERT notifications waiting for this enrichment (configurable
 * timeout via GRPC_DEDUP_TIMEOUT_SECS, default 5s). Once the UPDATE is done, the GRPC
 * emits the enriched swap to clients.
 * 
 * Usage:
 *   npx ts-node api/src/scripts/volumeEnricher.ts
 *   # or in production:
 *   node dist/scripts/volumeEnricher.js
 * 
 * Environment Variables:
 *   DATABASE_URL              - PostgreSQL connection string (required, same as API)
 *   JUPITER_API_URL           - Jupiter API base URL (default: https://api.jup.ag)
 *   JUPITER_API_KEY           - Jupiter API key for higher rate limits (optional)
 *   JUPITER_TIMEOUT_MS        - Jupiter API request timeout in ms (default: 3000)
 *   PRICE_CACHE_TTL_MS        - How long to cache token prices in ms (default: 30000)
 */

import { Pool, Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// --- Configuration (all overridable via environment variables) ---

const JUPITER_API_URL = process.env.JUPITER_API_URL || 'https://api.jup.ag';
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const JUPITER_TIMEOUT_MS = parseInt(process.env.JUPITER_TIMEOUT_MS || '3000', 10);
const PRICE_CACHE_TTL_MS = parseInt(process.env.PRICE_CACHE_TTL_MS || '30000', 10);

// --- Price Cache ---

interface PriceCacheEntry {
  price: number;
  decimals: number;
  timestamp: number;
}

const priceCache = new Map<string, PriceCacheEntry>();

function getCachedPrice(mint: string): { price: number; decimals: number } | null {
  const entry = priceCache.get(mint);
  if (entry && Date.now() - entry.timestamp < PRICE_CACHE_TTL_MS) {
    return { price: entry.price, decimals: entry.decimals };
  }
  return null;
}

function setCachedPrice(mint: string, price: number, decimals: number): void {
  priceCache.set(mint, { price, decimals, timestamp: Date.now() });
}

// --- Pool Info Cache ---

interface PoolInfo {
  token0: string;
  token1: string;
}

const poolInfoCache = new Map<string, PoolInfo>();

// --- DB Pool ---

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  min: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  application_name: 'omnipair_volume_enricher',
});

// --- Jupiter Price API V3 ---

interface JupiterV3PriceData {
  usdPrice: number;
  decimals: number;
  blockId?: number;
  priceChange24h?: number;
}

type PriceResult = { price: number; decimals: number };

/**
 * Fetch prices for multiple token mints in a single Jupiter V3 API call.
 * Results are cached individually. Returns a map of mint -> price data.
 */
async function fetchTokenPrices(mints: string[]): Promise<Map<string, PriceResult>> {
  const results = new Map<string, PriceResult>();

  // Check cache first, collect uncached mints
  const uncachedMints: string[] = [];
  for (const mint of mints) {
    const cached = getCachedPrice(mint);
    if (cached !== null) {
      results.set(mint, cached);
    } else {
      uncachedMints.push(mint);
    }
  }

  // If all cached, return early
  if (uncachedMints.length === 0) {
    return results;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JUPITER_TIMEOUT_MS);

    const headers: Record<string, string> = {};
    if (JUPITER_API_KEY) {
      headers['x-api-key'] = JUPITER_API_KEY;
    }

    // Batch all uncached mints into a single comma-separated request
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

    // V3 response format: { "MINT1": { "usdPrice": 147.47, "decimals": 9 }, "MINT2": { ... } }
    const data = await response.json() as Record<string, JupiterV3PriceData>;

    for (const mint of uncachedMints) {
      const tokenData = data?.[mint];
      if (tokenData && tokenData.usdPrice && !isNaN(tokenData.usdPrice) && tokenData.usdPrice > 0) {
        const result: PriceResult = {
          price: tokenData.usdPrice,
          decimals: tokenData.decimals ?? 6,
        };
        setCachedPrice(mint, result.price, result.decimals);
        results.set(mint, result);
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

// --- Pool Info Lookup ---

async function getPoolInfo(pairAddress: string): Promise<PoolInfo | null> {
  const cached = poolInfoCache.get(pairAddress);
  if (cached) return cached;

  try {
    const result = await pool.query(
      'SELECT token0, token1 FROM pools WHERE pair_address = $1',
      [pairAddress]
    );

    if (result.rows.length === 0) {
      console.warn(`No pool found for pair ${pairAddress}`);
      return null;
    }

    const row = result.rows[0];
    const info: PoolInfo = {
      token0: row.token0,
      token1: row.token1,
    };

    poolInfoCache.set(pairAddress, info);
    return info;
  } catch (error: any) {
    console.error(`Error fetching pool info for ${pairAddress}:`, error.message);
    return null;
  }
}

// --- Volume Calculation ---

async function computeVolumeUsd(
  pairAddress: string,
  isToken0In: boolean,
  amountIn: string,
  amountOut: string
): Promise<number> {
  const poolInfo = await getPoolInfo(pairAddress);
  if (!poolInfo) return 0;

  const tokenInMint = isToken0In ? poolInfo.token0 : poolInfo.token1;
  const tokenOutMint = isToken0In ? poolInfo.token1 : poolInfo.token0;

  // Fetch both token prices in a single Jupiter API call
  const prices = await fetchTokenPrices([tokenInMint, tokenOutMint]);

  // Prefer input token price
  const tokenInPrice = prices.get(tokenInMint);
  if (tokenInPrice) {
    const humanAmount = parseFloat(amountIn) / Math.pow(10, tokenInPrice.decimals);
    return humanAmount * tokenInPrice.price;
  }

  // Fallback: use output token price
  const tokenOutPrice = prices.get(tokenOutMint);
  if (tokenOutPrice) {
    const humanAmount = parseFloat(amountOut) / Math.pow(10, tokenOutPrice.decimals);
    return humanAmount * tokenOutPrice.price;
  }

  // Neither token has a price
  console.warn(`No USD price available for either token in pair ${pairAddress}`);
  return 0;
}

// --- Swap Notification Handler ---

interface SwapNotification {
  op: string;
  id: string;
  pair: string;
  is_token0_in: boolean;
  amount_in: string;
  amount_out: string;
  tx_sig: string;
  volume_usd: string;
}

async function handleSwapNotification(payload: string): Promise<void> {
  let notification: SwapNotification;
  try {
    notification = JSON.parse(payload);
  } catch (error) {
    console.error('Failed to parse swap notification:', error);
    return;
  }

  // Only process INSERT notifications (UPDATE means it's already enriched)
  if (notification.op !== 'INSERT') {
    return;
  }

  // Skip if volume_usd is already set (shouldn't happen on INSERT but just in case)
  if (notification.volume_usd && notification.volume_usd !== '' && notification.volume_usd !== '0') {
    return;
  }

  const txSig = notification.tx_sig;
  const pairAddress = notification.pair;

  try {
    const volumeUsd = await computeVolumeUsd(
      pairAddress,
      notification.is_token0_in,
      notification.amount_in,
      notification.amount_out
    );

    // UPDATE the swap with volume_usd
    await pool.query(
      'UPDATE swaps SET volume_usd = $1 WHERE tx_sig = $2',
      [volumeUsd, txSig]
    );

    console.log(
      `Enriched swap - Pair: ${pairAddress}, TxSig: ${txSig}, VolumeUSD: $${volumeUsd.toFixed(2)}`
    );
  } catch (error: any) {
    console.error(`Error enriching swap ${txSig}:`, error.message);
  }
}

// --- Main ---

async function main(): Promise<void> {
  console.log('=== Omnipair Volume Enricher ===');
  console.log('Configuration:');
  console.log(`  JUPITER_API_URL:    ${JUPITER_API_URL}/price/v3`);
  console.log(`  JUPITER_API_KEY:    ${JUPITER_API_KEY ? 'configured' : 'not set (using public rate limits)'}`);
  console.log(`  JUPITER_TIMEOUT_MS: ${JUPITER_TIMEOUT_MS}ms`);
  console.log(`  PRICE_CACHE_TTL_MS: ${PRICE_CACHE_TTL_MS}ms`);
  console.log('Connecting to PostgreSQL...');

  // Test connection
  await pool.query('SELECT 1');
  console.log('Database connection established');

  // Use a separate client for LISTEN (pg LISTEN requires a dedicated connection)
  const listenClient = new Client({
    connectionString: process.env.DATABASE_URL,
    application_name: 'omnipair_volume_enricher_listener',
  });

  await listenClient.connect();
  console.log('LISTEN client connected');

  await listenClient.query('LISTEN swap_updates');
  console.log('Listening on channel: swap_updates');
  console.log('Waiting for swap events...\n');

  listenClient.on('notification', async (msg) => {
    if (msg.channel === 'swap_updates' && msg.payload) {
      await handleSwapNotification(msg.payload);
    }
  });

  listenClient.on('error', (error) => {
    console.error('LISTEN client error:', error);
    process.exit(1);
  });

  // Keep the process alive
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await listenClient.end();
    await pool.end();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down...');
    await listenClient.end();
    await pool.end();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
