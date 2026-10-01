const JUPITER_API_URL = (process.env.JUPITER_API_URL || 'https://jup-proxy-production-eff9.up.railway.app').replace(/\/+$/, '');
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';
const JUPITER_TIMEOUT_MS = parseInt(process.env.JUPITER_TIMEOUT_MS || '3000', 10);
const PRICE_CACHE_TTL_MS = parseInt(process.env.PRICE_CACHE_TTL_MS || '30000', 10);

interface PriceCacheEntry {
  price: number;
  decimals: number;
  timestamp: number;
}

const priceCache = new Map<string, PriceCacheEntry>();

function getCachedPrice(mint: string): PriceResult | null {
  const entry = priceCache.get(mint);
  if (entry && Date.now() - entry.timestamp < PRICE_CACHE_TTL_MS) {
    return { price: entry.price, decimals: entry.decimals };
  }
  return null;
}

function setCachedPrice(mint: string, price: number, decimals: number): void {
  priceCache.set(mint, { price, decimals, timestamp: Date.now() });
}

interface JupiterV3PriceData {
  usdPrice: number;
  decimals: number;
  blockId?: number;
  priceChange24h?: number;
}

export type PriceResult = { price: number; decimals: number };

/**
 * Fetch prices for unique token mints in Jupiter V3 batches of at most 50.
 * Results are cached individually. Returns a map of mint -> price data.
 */
export async function fetchTokenPrices(mints: string[]): Promise<Map<string, PriceResult>> {
  mints = [...new Set(mints)];
  const results = new Map<string, PriceResult>();

  const uncachedMints: string[] = [];
  for (const mint of mints) {
    const cached = getCachedPrice(mint);
    if (cached !== null) {
      results.set(mint, cached);
    } else {
      uncachedMints.push(mint);
    }
  }

  if (uncachedMints.length === 0) {
    return results;
  }

  const batches: string[][] = [];
  for (let offset = 0; offset < uncachedMints.length; offset += 50) {
    batches.push(uncachedMints.slice(offset, offset + 50));
  }
  await Promise.all(batches.map(async (batch) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JUPITER_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {};
      if (JUPITER_API_KEY) {
        headers['x-api-key'] = JUPITER_API_KEY;
      }

      const ids = batch.join(',');
      const response = await fetch(`${JUPITER_API_URL}/price/v3?ids=${ids}`, {
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        console.warn(`Jupiter Price V3 returned ${response.status} for mints: ${ids}`);
        return;
      }

      const data = await response.json() as Record<string, JupiterV3PriceData>;

      for (const mint of batch) {
        const tokenData = data?.[mint];
        if (tokenData && typeof tokenData.usdPrice === 'number' && Number.isFinite(tokenData.usdPrice) && tokenData.usdPrice > 0) {
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
        console.warn(`Jupiter Price V3 timeout for mints: ${batch.join(',')}`);
      } else {
        console.error(`Error fetching prices:`, error.message);
      }
    } finally {
      clearTimeout(timeout);
    }
  }));

  return results;
}
