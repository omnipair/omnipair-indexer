import { readTokenLogoConfig, TOKEN_LOGO_SCAN_MS } from '../config/tokenLogos';
import { isTokenMint, S3TokenLogoStorage, TokenLogoStorage } from './tokenLogoStorage';

/** Only the object inventory is kept in memory; image files persist in the bucket. */
export class TokenLogoService {
  private inventory = new Map<string, Date>();
  private pending: Promise<void> | null = null;
  private timer?: NodeJS.Timeout;

  constructor(readonly storage: TokenLogoStorage, private readonly apiOrigin: string) {}

  iconUrl(mint: string, original: string | null | undefined): string | null {
    return this.inventory.has(mint)
      ? `${this.apiOrigin}/api/v1/tokens/${mint}/icon`
      : original || null;
  }

  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.storage.list().then((inventory) => {
      this.inventory = inventory;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  start(): void {
    if (this.timer) return;
    const refresh = () => void this.refresh().catch((error) => {
      console.error('Token logo inventory refresh failed:', error instanceof Error ? error.message : 'unknown error');
    });
    refresh();
    this.timer = setInterval(refresh, TOKEN_LOGO_SCAN_MS);
    this.timer.unref();
  }

  forget(mint: string): void { this.inventory.delete(mint); }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.pending?.catch(() => {});
    this.storage.close();
  }
}

let singleton: TokenLogoService | null | undefined;

export function getTokenLogoService(): TokenLogoService | null {
  if (singleton === undefined) {
    const config = readTokenLogoConfig();
    singleton = config ? new TokenLogoService(new S3TokenLogoStorage(config), config.apiOrigin) : null;
  }
  return singleton;
}

/** Project URLs after reading the pool cache, so a new logo appears without revaluing pools. */
export function withCachedTokenLogos<T extends { token0: { address: string; icon?: string | null }; token1: { address: string; icon?: string | null } }>(pool: T, service: TokenLogoService | null): T {
  if (!service) return pool;
  return {
    ...pool,
    token0: { ...pool.token0, icon: service.iconUrl(pool.token0.address, pool.token0.icon) },
    token1: { ...pool.token1, icon: service.iconUrl(pool.token1.address, pool.token1.icon) },
  };
}

export { isTokenMint };
