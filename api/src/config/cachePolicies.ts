import type { CachePolicy } from '../utils/cache';

// TTL controls when to refresh, not when to stop serving a retained value.
// Stale entries remain available until replaced, invalidated or evicted.
export const OVERVIEW_CACHE_POLICY: CachePolicy = {
  ttlMs: 15_000,
  staleWhileRevalidateMs: Number.POSITIVE_INFINITY,
};

export const STATS_CHART_CACHE_POLICY: CachePolicy = {
  ttlMs: 60_000,
  staleWhileRevalidateMs: Number.POSITIVE_INFINITY,
};
