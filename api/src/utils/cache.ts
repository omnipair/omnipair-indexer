interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const MAX_CACHE_ENTRIES = 10_000;
type CacheLookupStatus = 'hit' | 'miss' | 'coalesced';

interface CacheStats {
  hits: number;
  misses: number;
  coalesced: number;
}

class SimpleCache {
  private cache: Map<string, CacheEntry> = new Map();
  private inflight: Map<string, Promise<any>> = new Map();
  private stats: Map<string, CacheStats> = new Map();

  set(key: string, data: any, ttlMs: number = 60000): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
      this.evictOldest();
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
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
    const current = this.stats.get(namespace) || { hits: 0, misses: 0, coalesced: 0 };

    if (status === 'hit') {
      current.hits += 1;
    } else if (status === 'coalesced') {
      current.coalesced += 1;
    } else {
      current.misses += 1;
    }

    this.stats.set(namespace, current);
  }

  /**
   * Returns cached data if available. On a miss, only the first caller runs
   * the fetcher; concurrent callers await the same in-flight promise.
   */
  async getOrSet<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const { data } = await this.getOrSetWithMeta(key, ttlMs, fetcher);
    return data;
  }

  async getOrSetWithMeta<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>
  ): Promise<{ data: T; cacheStatus: CacheLookupStatus }> {
    const cached = this.get(key);
    if (cached !== null) {
      this.trackLookup(key, 'hit');
      return { data: cached as T, cacheStatus: 'hit' };
    }

    const pending = this.inflight.get(key);
    if (pending) {
      this.trackLookup(key, 'coalesced');
      const data = await pending as T;
      return { data, cacheStatus: 'coalesced' };
    }

    this.trackLookup(key, 'miss');
    const promise = fetcher()
      .then((data) => {
        if (data != null) {
          this.set(key, data, ttlMs);
        }
        return data;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    const data = await promise as T;
    return { data, cacheStatus: 'miss' };
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  deleteByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
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
      if (now - entry.timestamp > entry.ttl) {
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
