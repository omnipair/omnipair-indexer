interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  staleWhileRevalidateMs: number;
  retryAfter: number;
}

const MAX_CACHE_ENTRIES = 10_000;
const REFRESH_RETRY_MS = 5_000;
export type CacheLookupStatus = 'hit' | 'miss' | 'coalesced' | 'stale';

export interface CachePolicy {
  ttlMs: number;
  /** Additional stale-serving time after ttlMs. Infinity retains values without an age cutoff. */
  staleWhileRevalidateMs?: number;
  /** Wait for a fresh value when rebuilding another cached response. */
  allowStale?: boolean;
}

type CacheLifetime = number | CachePolicy;

interface CacheStats {
  hits: number;
  misses: number;
  coalesced: number;
  stale: number;
}

export class SimpleCache {
  private cache: Map<string, CacheEntry> = new Map();
  private inflight: Map<string, Promise<any>> = new Map();
  private stats: Map<string, CacheStats> = new Map();

  set(key: string, data: any, lifetime: CacheLifetime = 60000): void {
    this.delete(key);
    this.store(key, data, this.policy(lifetime));
  }

  private policy(lifetime: CacheLifetime): CachePolicy {
    return typeof lifetime === 'number' ? { ttlMs: lifetime } : lifetime;
  }

  private store(key: string, data: any, policy: CachePolicy): void {
    // Wallet position reads use TTL 0 for in-flight deduplication only.
    if (policy.ttlMs <= 0 || data == null) return;

    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
      this.evictOldest();
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: policy.ttlMs,
      staleWhileRevalidateMs: Math.max(0, policy.staleWhileRevalidateMs ?? 0),
      retryAfter: 0,
    });
  }

  get(key: string): any | null {
    const entry = this.getEntry(key);
    return entry && Date.now() - entry.timestamp < entry.ttl ? entry.data : null;
  }

  private getEntry(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp >= entry.ttl + entry.staleWhileRevalidateMs) {
      this.cache.delete(key);
      return undefined;
    }
    return entry;
  }

  private getNamespace(key: string): string {
    const firstSegment = key.split(':')[0];
    if (firstSegment && firstSegment.length > 0) {
      return firstSegment;
    }
    return 'global';
  }

  private trackLookup(key: string, status: CacheLookupStatus): void {
    const namespace = this.getNamespace(key);
    const current = this.stats.get(namespace) || { hits: 0, misses: 0, coalesced: 0, stale: 0 };

    if (status === 'hit') {
      current.hits += 1;
    } else if (status === 'coalesced') {
      current.coalesced += 1;
    } else if (status === 'stale') {
      current.stale += 1;
    } else {
      current.misses += 1;
    }

    this.stats.set(namespace, current);
  }

  /**
   * Returns cached data if available. On a miss, only the first caller runs
   * the fetcher; concurrent callers await the same in-flight promise. Policies
   * with a stale window return stale data while one background refresh runs.
   */
  async getOrSet<T>(key: string, lifetime: CacheLifetime, fetcher: () => Promise<T>): Promise<T> {
    const { data } = await this.getOrSetWithMeta(key, lifetime, fetcher);
    return data;
  }

  async getOrSetWithMeta<T>(
    key: string,
    lifetime: CacheLifetime,
    fetcher: () => Promise<T>
  ): Promise<{ data: T; cacheStatus: CacheLookupStatus }> {
    const policy = this.policy(lifetime);
    const entry = policy.ttlMs > 0 ? this.getEntry(key) : undefined;
    if (entry && Date.now() - entry.timestamp < entry.ttl) {
      this.trackLookup(key, 'hit');
      return { data: entry.data as T, cacheStatus: 'hit' };
    }

    if (entry && policy.allowStale !== false && (policy.staleWhileRevalidateMs ?? 0) > 0) {
      this.trackLookup(key, 'stale');
      if (!this.inflight.has(key) && Date.now() >= entry.retryAfter) {
        // Handle rejection here: background work has no request waiting on it.
        void this.fetchAndStore(key, policy, fetcher).then(
          (data) => {
            if (data == null && this.cache.get(key) === entry) {
              entry.retryAfter = Date.now() + REFRESH_RETRY_MS;
            }
          },
          (error) => {
            if (this.cache.get(key) === entry) {
              entry.retryAfter = Date.now() + REFRESH_RETRY_MS;
            }
            console.warn(`[cache] background refresh failed key=${key}`, error);
          }
        );
      }
      return { data: entry.data as T, cacheStatus: 'stale' };
    }

    const pending = this.inflight.get(key);
    if (pending) {
      this.trackLookup(key, 'coalesced');
      const data = await pending as T;
      return { data, cacheStatus: 'coalesced' };
    }

    this.trackLookup(key, 'miss');
    const data = await this.fetchAndStore(key, policy, fetcher);
    return { data, cacheStatus: 'miss' };
  }

  private fetchAndStore<T>(key: string, policy: CachePolicy, fetcher: () => Promise<T>): Promise<T> {
    // The promise itself is an ownership token. Invalidating a key detaches it,
    // so an old read can neither repopulate the cache nor remove a newer fetch.
    const promise = Promise.resolve().then(fetcher)
      .then((data) => {
        if (this.inflight.get(key) === promise) {
          this.store(key, data, policy);
        }
        return data;
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) {
          this.inflight.delete(key);
        }
      });

    this.inflight.set(key, promise);
    return promise;
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.inflight.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.inflight.clear();
  }

  deleteByPrefix(prefix: string): number {
    let removed = 0;
    // Include cold reads that have no stored entry yet.
    const keys = new Set([...this.cache.keys(), ...this.inflight.keys()]);
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        this.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  snapshotStats(): Record<string, CacheStats> {
    const result: Record<string, CacheStats> = {};
    for (const [namespace, stats] of this.stats.entries()) {
      result[namespace] = { ...stats };
    }
    return result;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= entry.ttl + entry.staleWhileRevalidateMs) {
        this.cache.delete(key);
      }
    }
  }

  private evictOldest(): void {
    this.cleanup();
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }
}

export const cache = new SimpleCache();

const cleanupInterval = setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);

cleanupInterval.unref();

export default cache;
