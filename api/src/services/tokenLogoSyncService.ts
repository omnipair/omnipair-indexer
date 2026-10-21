import sharp from 'sharp';
import { TOKEN_LOGO_REFRESH_MS } from '../config/tokenLogos';
import { resolveIpfsUrl } from '../utils/ipfs';
import { safeFetch } from '../utils/safeFetch';
import { isTokenMint, TokenLogoStorage } from './tokenLogoStorage';

export async function downloadTokenLogo(source: string): Promise<Buffer> {
  const response = await safeFetch(resolveIpfsUrl(source), {
    timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024, requireImage: true,
  });
  return sharp(response.body, { limitInputPixels: 16 * 1024 * 1024, failOn: 'error', animated: false })
    .rotate()
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 85 })
    .timeout({ seconds: 5 })
    .toBuffer();
}

interface SyncOptions {
  storage: TokenLogoStorage;
  mints: string[];
  resolveSource: (mint: string) => Promise<string | null | undefined>;
  download?: (source: string) => Promise<Buffer>;
  now?: number;
  shouldStop?: () => boolean;
}

export async function syncTokenLogos({
  storage, mints, resolveSource, download = downloadTokenLogo,
  now = Date.now(), shouldStop = () => false,
}: SyncOptions) {
  const existing = await storage.list();
  const summary = { created: 0, refreshed: 0, skipped: 0, failed: 0 };
  const queue = [...new Set(mints.filter(isTokenMint))];
  let index = 0;
  const work = async () => {
    while (!shouldStop() && index < queue.length) {
      const mint = queue[index++];
      const lastModified = existing.get(mint);
      if (lastModified && now - lastModified.getTime() < TOKEN_LOGO_REFRESH_MS) {
        summary.skipped++;
        continue;
      }
      try {
        const source = await resolveSource(mint);
        if (!source?.trim() || new URL(resolveIpfsUrl(source)).hostname === 'placehold.net') {
          throw new Error('Token metadata has no usable logo');
        }
        const body = await download(source);
        // A failed download/transform/upload leaves the previous object intact.
        await storage.put(mint, body);
        if (lastModified) summary.refreshed++;
        else summary.created++;
      } catch (error) {
        summary.failed++;
        console.warn(`Token logo sync failed for ${mint}:`, error instanceof Error ? error.message : 'unknown error');
      }
    }
  };
  await Promise.all([work(), work()]);
  return summary;
}
