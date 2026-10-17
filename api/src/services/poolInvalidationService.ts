import { PoolClient } from 'pg';
import pool from '../config/database';
import { cache } from '../utils/cache';

let listenerClient: PoolClient | null = null;
let started = false;

const POOLS_CACHE_PREFIX = 'pools:enriched:';
const POOL_INFO_CACHE_PREFIX = 'pool_info_';

function invalidatePoolsCache(reason: string): void {
  const removed = cache.deleteByPrefix(POOLS_CACHE_PREFIX)
    + cache.deleteByPrefix(POOL_INFO_CACHE_PREFIX)
    + cache.deleteByPrefix('stats:tvl');
  if (removed > 0) {
    console.log(`[cache] invalidated pools cache reason=${reason} removed=${removed}`);
  }
}

function safeParsePayload(payload?: string): Record<string, any> | null {
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch (error) {
    console.error('[cache] failed to parse pool_updates payload', error);
    return null;
  }
}

export async function startPoolInvalidationListener(): Promise<void> {
  if (started) {
    return;
  }

  listenerClient = await pool.connect();
  started = true;
  await listenerClient.query('LISTEN pool_updates');

  listenerClient.on('notification', (msg) => {
    if (msg.channel !== 'pool_updates') {
      return;
    }
    const payload = safeParsePayload(msg.payload);
    const op = (payload?.op as string | undefined) ?? 'UNKNOWN';
    const pair = (payload?.pair as string | undefined) ?? 'unknown';
    invalidatePoolsCache(`pool_updates op=${op} pair=${pair}`);
  });

  listenerClient.on('error', (error) => {
    console.error('[cache] pool invalidation listener error', error);
  });

  console.log('[cache] pool invalidation listener started (pool_updates)');
}

export async function stopPoolInvalidationListener(): Promise<void> {
  if (!listenerClient) {
    return;
  }

  try {
    await listenerClient.query('UNLISTEN pool_updates');
  } catch (error) {
    console.error('[cache] failed to unlisten pool_updates channel', error);
  }

  listenerClient.release();
  listenerClient = null;
  started = false;
}
