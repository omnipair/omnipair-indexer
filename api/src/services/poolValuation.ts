import type { PriceResult } from './jupiterPriceService';

interface ValuedPool {
  token0: { address: string; decimals: number };
  token1: { address: string; decimals: number };
  reserves: { token0: string; token1: string };
  total_debts: { token0: string; token1: string };
}

function normalizePrice(price: number | undefined): number | null {
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

function valueAmount(amount: number, price: number | null): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (amount === 0) return 0;
  if (price === null) return null;
  const value = amount * price;
  return Number.isFinite(value) ? value : null;
}

function sumValues(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  const total = a + b;
  return Number.isFinite(total) ? total : null;
}

/** Match the webapp: reserves are token units, debts are raw mint units. */
export function calculatePoolValuation(pool: ValuedPool, prices: ReadonlyMap<string, PriceResult>) {
  const price0 = normalizePrice(prices.get(pool.token0.address)?.price);
  const price1 = normalizePrice(prices.get(pool.token1.address)?.price);
  const reservesUsd = {
    token0: valueAmount(Number(pool.reserves.token0), price0),
    token1: valueAmount(Number(pool.reserves.token1), price1),
  };
  const totalDebtsUsd = {
    token0: valueAmount(Number(pool.total_debts.token0) / 10 ** pool.token0.decimals, price0),
    token1: valueAmount(Number(pool.total_debts.token1) / 10 ** pool.token1.decimals, price1),
  };
  return {
    token_prices_usd: { token0: price0, token1: price1 },
    reserves_usd: reservesUsd,
    total_debts_usd: totalDebtsUsd,
    tvl_usd: sumValues(reservesUsd.token0, reservesUsd.token1),
    total_debt_usd: sumValues(totalDebtsUsd.token0, totalDebtsUsd.token1),
  };
}
