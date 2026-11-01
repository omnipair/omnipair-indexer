import 'dotenv/config';
import pool from '../config/database';
import { readLpAssetConfig } from '../config/lpAssets';
import { LpAssetStore } from '../services/lpAssets/store';
import { LpTokenResolver, mainnetConnection, verifyMainnet } from '../services/lpAssets/upstream';
import { composeIcon } from '../services/lpAssets/render';
import { LpPinataUploader } from '../services/lpAssets/pinata';
import { processAssetJob } from '../services/lpAssets/worker';

async function main(): Promise<void> {
  const config = readLpAssetConfig();
  if (!config) throw new Error('LP assets disabled');
  const connection = mainnetConnection(config.rpcUrl);
  await verifyMainnet(connection);
  // Fail at startup if the migration is missing; never run migrations automatically.
  await pool.query('SELECT key FROM lp_asset_jobs LIMIT 0');
  const store = new LpAssetStore(pool);
  const resolver = new LpTokenResolver(connection);
  const uploader = new LpPinataUploader(config);
  let stopping = false;
  const shutdown = () => { stopping = true; };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  const once = process.argv.includes('--once');
  try {
    await Promise.all(Array.from({ length: config.concurrency }, async () => {
      while (!stopping) {
        try {
          const job = await store.claim();
          if (job) {
            await processAssetJob(store, job, {
              resolve: (mint) => resolver.resolve(mint), render: composeIcon,
              upload: (kind, pair, body, signal) => uploader.upload(kind, pair, body, signal),
            });
          } else if (once) break;
          else await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch {
          console.error('LP asset worker database operation failed');
          if (once) { process.exitCode = 1; break; }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }));
  } finally {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
  }
}

main().catch(() => {
  console.error('LP asset worker startup failed; check configuration, mainnet RPC, and migration 018');
  process.exitCode = 1;
}).finally(() => pool.end());
