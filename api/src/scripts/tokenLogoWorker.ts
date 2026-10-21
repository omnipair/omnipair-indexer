import 'dotenv/config';
import pool from '../config/database';
import { readTokenLogoConfig, TOKEN_LOGO_SCAN_MS } from '../config/tokenLogos';
import { KNOWN_TOKEN_ICONS } from '../controllers/helpers/controllerBase';
import { PairStateService } from '../services/PairStateService';
import { S3TokenLogoStorage } from '../services/tokenLogoStorage';
import { syncTokenLogos } from '../services/tokenLogoSyncService';

async function main(): Promise<void> {
  const config = readTokenLogoConfig();
  if (!config) throw new Error('Set TOKEN_LOGO_CACHE_ENABLED=true to run the token logo worker');
  const storage = new S3TokenLogoStorage(config);
  const metadata = new PairStateService();
  let stopping = false;
  let wake: (() => void) | undefined;
  const shutdown = () => { stopping = true; wake?.(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  const once = process.argv.includes('--once');
  try {
    do {
      try {
        const result = await pool.query<{ mint: string }>(
          'SELECT token0 AS mint FROM pools UNION SELECT token1 AS mint FROM pools'
        );
        const summary = await syncTokenLogos({
          storage,
          mints: result.rows.map((row) => row.mint),
          shouldStop: () => stopping,
          resolveSource: async (mint) => {
            const token = await metadata.getTokenMetadata(mint, { refresh: true });
            return token.iconUrl && !token.iconUrl.includes('placehold.net/')
              ? token.iconUrl : KNOWN_TOKEN_ICONS[mint];
          },
        });
        console.log('Token logo sync complete:', summary);
        if (once && summary.failed > 0) process.exitCode = 1;
      } catch (error) {
        if (once) throw error;
        console.error('Token logo scan failed:', error instanceof Error ? error.message : 'unknown error');
      }
      if (once || stopping) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, TOKEN_LOGO_SCAN_MS);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    } while (!stopping);
  } finally {
    process.off('SIGTERM', shutdown);
    process.off('SIGINT', shutdown);
    storage.close();
  }
}

main().catch((error) => {
  console.error('Token logo worker failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
}).finally(() => pool.end());
