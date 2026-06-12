import { PoolClient } from 'pg';
import pool from '../config/database';
import { cache } from '../utils/cache';

let listenerClient: PoolClient | null = null;
let started = false;

function invalidateForUser(userAddress: string, pair?: string): void {
  const prefixes = [
    `swaps:user:${userAddress}:`,
    `liquidity:user:${userAddress}:`,
    `lending:user:${userAddress}:`,
    `activity:user:${userAddress}:`,
  ];

  if (pair) {
    prefixes.push(`swaps:user:${userAddress}:pair:${pair}:`);
    prefixes.push(`liquidity:user:${userAddress}:pair:${pair}:`);
    prefixes.push(`activity:user:${userAddress}:pair:${pair}:`);
  }

  let removed = 0;
  for (const prefix of prefixes) {
    removed += cache.deleteByPrefix(prefix);
  }

  if (removed > 0) {
    console.log(`[cache] invalidated user activity caches user=${userAddress} pair=${pair || 'all'} removed=${removed}`);
  }
}

function invalidateForPool(pair?: string): void {
  if (!pair) {
    return;
  }

  const removed = cache.deleteByPrefix(`activity:pool:${pair}:`);
  if (removed > 0) {
    console.log(`[cache] invalidated market activity caches pair=${pair} removed=${removed}`);
  }
}

function safeParsePayload(payload?: string): Record<string, any> | null {
  if (!payload) {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch (error) {
    console.error('[cache] failed to parse notification payload', error);
    return null;
  }
}

export async function startActivityInvalidationListener(): Promise<void> {
  if (started) {
    return;
  }

  listenerClient = await pool.connect();
  started = true;
  await listenerClient.query('LISTEN swap_updates');
  await listenerClient.query('LISTEN activity_updates');

  listenerClient.on('notification', (msg) => {
    if (!msg.channel) {
      return;
    }
    const payload = safeParsePayload(msg.payload);
    if (!payload) {
      return;
    }

    if (msg.channel === 'swap_updates') {
      const userAddress = payload.user_address as string | undefined;
      const pair = payload.pair as string | undefined;
      if (userAddress) {
        invalidateForUser(userAddress, pair);
      }
      invalidateForPool(pair);
      return;
    }

    if (msg.channel === 'activity_updates') {
      const userAddress = payload.user_address as string | undefined;
      const pair = payload.pair as string | undefined;
      if (userAddress) {
        invalidateForUser(userAddress, pair);
      }
      invalidateForPool(pair);
    }
  });

  listenerClient.on('error', (error) => {
    console.error('[cache] activity invalidation listener error', error);
  });

  console.log('[cache] activity invalidation listeners started (swap_updates, activity_updates)');
}

export async function stopActivityInvalidationListener(): Promise<void> {
  if (!listenerClient) {
    return;
  }

  try {
    await listenerClient.query('UNLISTEN swap_updates');
    await listenerClient.query('UNLISTEN activity_updates');
  } catch (error) {
    console.error('[cache] failed to unlisten channels', error);
  }

  listenerClient.release();
  listenerClient = null;
  started = false;
}
