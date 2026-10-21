import type { CacheLookupStatus } from './cache';

interface CounterSet {
  hit: number;
  miss: number;
  coalesced: number;
  stale: number;
}

class RollingLatencyStore {
  private readonly maxSamples: number;
  private samples: number[] = [];

  constructor(maxSamples: number) {
    this.maxSamples = maxSamples;
  }

  add(valueMs: number): void {
    this.samples.push(valueMs);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  summary(): { count: number; p50: number; p95: number; max: number } {
    if (this.samples.length === 0) {
      return { count: 0, p50: 0, p95: 0, max: 0 };
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const p50Index = Math.floor((sorted.length - 1) * 0.5);
    const p95Index = Math.floor((sorted.length - 1) * 0.95);

    return {
      count: sorted.length,
      p50: Math.round(sorted[p50Index]),
      p95: Math.round(sorted[p95Index]),
      max: Math.round(sorted[sorted.length - 1]),
    };
  }
}

class PerfMetrics {
  private endpointLatencies: Map<string, RollingLatencyStore> = new Map();
  private dbLatencies: Map<string, RollingLatencyStore> = new Map();
  private cacheByEndpoint: Map<string, CounterSet> = new Map();
  private started = false;
  private reportInterval: NodeJS.Timeout | null = null;

  private getLatencyStore(target: Map<string, RollingLatencyStore>, key: string): RollingLatencyStore {
    let store = target.get(key);
    if (!store) {
      store = new RollingLatencyStore(4000);
      target.set(key, store);
    }
    return store;
  }

  private getCounter(endpoint: string): CounterSet {
    let counter = this.cacheByEndpoint.get(endpoint);
    if (!counter) {
      counter = { hit: 0, miss: 0, coalesced: 0, stale: 0 };
      this.cacheByEndpoint.set(endpoint, counter);
    }
    return counter;
  }

  recordEndpointLatency(endpoint: string, durationMs: number): void {
    this.getLatencyStore(this.endpointLatencies, endpoint).add(durationMs);
  }

  recordDbQuery(queryName: string, durationMs: number): void {
    this.getLatencyStore(this.dbLatencies, queryName).add(durationMs);
  }

  recordCacheLookup(endpoint: string, status: CacheLookupStatus): void {
    const counter = this.getCounter(endpoint);
    counter[status] += 1;
  }

  logSnapshot(): void {
    for (const [endpoint, latency] of this.endpointLatencies.entries()) {
      const summary = latency.summary();
      if (summary.count === 0) {
        continue;
      }
      console.log(
        `[metrics][endpoint] endpoint=${endpoint} count=${summary.count} p50_ms=${summary.p50} p95_ms=${summary.p95} max_ms=${summary.max}`
      );
    }

    for (const [queryName, latency] of this.dbLatencies.entries()) {
      const summary = latency.summary();
      if (summary.count === 0) {
        continue;
      }
      console.log(
        `[metrics][db] query=${queryName} count=${summary.count} p50_ms=${summary.p50} p95_ms=${summary.p95} max_ms=${summary.max}`
      );
    }

    for (const [endpoint, counter] of this.cacheByEndpoint.entries()) {
      const total = counter.hit + counter.miss + counter.coalesced + counter.stale;
      if (total === 0) {
        continue;
      }
      const hitRate = Math.round(((counter.hit + counter.coalesced + counter.stale) / total) * 10000) / 100;
      console.log(
        `[metrics][cache] endpoint=${endpoint} hit=${counter.hit} coalesced=${counter.coalesced} stale=${counter.stale} miss=${counter.miss} hit_rate_pct=${hitRate}`
      );
    }
  }

  ensureReporting(intervalMs: number = 60_000): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.reportInterval = setInterval(() => {
      this.logSnapshot();
    }, intervalMs);
  }

  stopReporting(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
    this.started = false;
  }
}

export const perfMetrics = new PerfMetrics();
