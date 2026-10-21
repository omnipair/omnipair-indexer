import test, { after, TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import app from '../app';
import { PoolController } from '../controllers/poolController';
import { readTokenLogoConfig, TOKEN_LOGO_REFRESH_MS, TOKEN_LOGO_MAX_BYTES } from '../config/tokenLogos';
import * as logoServices from '../services/tokenLogoService';
import { S3TokenLogoStorage, TokenLogoStorage, tokenLogoKey, isTokenMint } from '../services/tokenLogoStorage';
import { downloadTokenLogo, syncTokenLogos } from '../services/tokenLogoSyncService';
import * as fetcher from '../utils/safeFetch';
import { resolveIpfsUrl } from '../utils/ipfs';
import { cache } from '../utils/cache';
import { perfMetrics } from '../utils/perfMetrics';

after(() => perfMetrics.stopReporting());

const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const now = Date.parse('2026-10-21T00:00:00Z');
const config = {
  endpoint: 'https://bucket.example.com', bucket: 'logos', region: 'auto',
  accessKeyId: 'test-key', secretAccessKey: 'test-secret', apiOrigin: 'https://api.example.com',
};
const configEnv = {
  TOKEN_LOGO_CACHE_ENABLED: 'true', TOKEN_LOGO_S3_ENDPOINT: config.endpoint,
  TOKEN_LOGO_S3_BUCKET: config.bucket, TOKEN_LOGO_S3_REGION: config.region,
  TOKEN_LOGO_S3_ACCESS_KEY_ID: config.accessKeyId, TOKEN_LOGO_S3_SECRET_ACCESS_KEY: config.secretAccessKey,
  TOKEN_LOGO_API_ORIGIN: config.apiOrigin,
};

function fakeStorage(inventory = new Map<string, Date>()): TokenLogoStorage {
  return {
    list: async () => new Map(inventory),
    get: async () => null,
    put: async (mint) => { inventory.set(mint, new Date(now)); },
    close: () => {},
  };
}

async function listen(t: TestContext): Promise<string> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

test('logo cache is opt-in and validates its required configuration', () => {
  assert.equal(readTokenLogoConfig({}), null);
  assert.equal(readTokenLogoConfig({ TOKEN_LOGO_CACHE_ENABLED: 'false' }), null);
  assert.deepEqual(readTokenLogoConfig(configEnv), { ...config, endpoint: `${config.endpoint}/` });
  assert.throws(() => readTokenLogoConfig({ TOKEN_LOGO_CACHE_ENABLED: 'true' }), /TOKEN_LOGO_S3_ENDPOINT/);
  assert.throws(() => readTokenLogoConfig({ ...configEnv, TOKEN_LOGO_API_ORIGIN: 'https://api.example.com/api/v1' }), /origin/);
  for (const value of ['http://example.com', 'https://user:password@example.com', 'https://example.com?key=x']) {
    assert.throws(() => readTokenLogoConfig({ ...configEnv, TOKEN_LOGO_S3_ENDPOINT: value }), /HTTPS/);
  }
});

test('logo keys accept only canonical Solana mints', () => {
  assert.equal(tokenLogoKey(SOL), `logos/${SOL}.webp`);
  for (const invalid of ['../secret', '', 'a'.repeat(44), '0'.repeat(32), `${SOL}/other`]) {
    assert.equal(isTokenMint(invalid), false);
    assert.throws(() => tokenLogoKey(invalid), /Invalid token mint/);
  }
});

test('IPFS URIs resolve to the configured HTTPS gateway, retaining paths', (t) => {
  const original = process.env.TOKEN_LOGO_IPFS_GATEWAY;
  process.env.TOKEN_LOGO_IPFS_GATEWAY = 'https://gateway.example.com/ipfs/';
  t.after(() => {
    if (original === undefined) delete process.env.TOKEN_LOGO_IPFS_GATEWAY;
    else process.env.TOKEN_LOGO_IPFS_GATEWAY = original;
  });
  assert.equal(resolveIpfsUrl(' ipfs://cid/logo.png '), 'https://gateway.example.com/ipfs/cid/logo.png');
  assert.equal(resolveIpfsUrl('ipfs://ipfs/cid'), 'https://gateway.example.com/ipfs/cid');
  assert.equal(resolveIpfsUrl(' https://example.com/logo '), 'https://example.com/logo');
  process.env.TOKEN_LOGO_IPFS_GATEWAY = 'http://localhost/ipfs/';
  assert.throws(() => resolveIpfsUrl('ipfs://cid'), /HTTPS/);
});

test('bucket inventory is paginated and excludes unrelated or invalid files', async (t) => {
  const requests: any[] = [];
  t.mock.method(S3Client.prototype, 'send', async (command: ListObjectsV2Command) => {
    assert.ok(command instanceof ListObjectsV2Command);
    requests.push(command.input);
    return requests.length === 1 ? {
      Contents: [
        { Key: `logos/${SOL}.webp`, Size: 32, LastModified: new Date(now) },
        { Key: 'logos/not-a-mint.webp', Size: 32, LastModified: new Date(now) },
        { Key: `other/${USDC}.webp`, Size: 32, LastModified: new Date(now) },
      ], IsTruncated: true, NextContinuationToken: 'page2',
    } : { Contents: [{ Key: `logos/${USDC}.webp`, Size: 32, LastModified: new Date(now) }] };
  });
  const storage = new S3TokenLogoStorage(config);
  t.after(() => storage.close());
  assert.deepEqual([...await storage.list()].map(([mint]) => mint), [SOL, USDC]);
  assert.equal(requests[0].Prefix, 'logos/');
  assert.equal(requests[1].ContinuationToken, 'page2');
});

test('failed or incomplete bucket listings never replace the last working inventory', async (t) => {
  const storage = fakeStorage(new Map([[SOL, new Date(now)]]));
  const service = new logoServices.TokenLogoService(storage, config.apiOrigin);
  await service.refresh();
  t.mock.method(storage, 'list', async () => { throw new Error('bucket offline'); });
  await assert.rejects(service.refresh(), /bucket offline/);
  assert.equal(service.iconUrl(SOL, 'ipfs://old'), `${config.apiOrigin}/api/v1/tokens/${SOL}/icon`);
  assert.equal(service.iconUrl(USDC, 'ipfs://usdc'), 'ipfs://usdc');
  service.forget(SOL);
  assert.equal(service.iconUrl(SOL, 'ipfs://old'), 'ipfs://old');
});

test('concurrent inventory refreshes share one bucket listing', async (t) => {
  let release!: (value: Map<string, Date>) => void;
  const storage = fakeStorage();
  const list = t.mock.method(storage, 'list', () => new Promise<Map<string, Date>>((resolve) => { release = resolve; }));
  const service = new logoServices.TokenLogoService(storage, config.apiOrigin);
  const first = service.refresh();
  const second = service.refresh();
  assert.equal(list.mock.callCount(), 1);
  release(new Map([[SOL, new Date(now)]]));
  await Promise.all([first, second]);
  assert.equal(service.iconUrl(SOL, null), `${config.apiOrigin}/api/v1/tokens/${SOL}/icon`);
});

test('new logos appear in cached pool responses without mutating the valuation snapshot', async (t) => {
  cache.clear();
  t.after(() => cache.clear());
  const storage = fakeStorage();
  const service = new logoServices.TokenLogoService(storage, config.apiOrigin);
  t.mock.method(logoServices, 'getTokenLogoService', () => service);
  const original = {
    token0: { address: SOL, icon: 'ipfs://sol', price_usd: 150 },
    token1: { address: USDC, icon: null, price_usd: 1 }, tvl_usd: 500,
  };
  cache.set('pools:enriched:visible', [original], 60_000);
  assert.equal((await PoolController.fetchAllPools(false))[0].token0.icon, 'ipfs://sol');
  await storage.put(SOL, Buffer.alloc(0));
  await service.refresh();
  const projected = (await PoolController.fetchAllPools(false))[0];
  assert.equal(projected.token0.icon, `${config.apiOrigin}/api/v1/tokens/${SOL}/icon`);
  assert.equal(projected.token0.price_usd, 150);
  assert.equal(projected.tvl_usd, 500);
  assert.equal(projected.token1.icon, null);
  assert.equal(original.token0.icon, 'ipfs://sol');
  t.mock.method(logoServices, 'getTokenLogoService', () => null);
  assert.deepEqual((await PoolController.fetchAllPools(false))[0], original);
});

test('worker deduplicates mints, fills missing logos, and refreshes only after one day', async (t) => {
  const storage = fakeStorage(new Map([[SOL, new Date(now - TOKEN_LOGO_REFRESH_MS + 1)]]));
  const writes = t.mock.method(storage, 'put');
  const resolveSource = t.mock.fn(async () => 'https://example.com/logo.png');
  const download = t.mock.fn(async () => Buffer.from('optimized'));
  const options = { storage, mints: [SOL, SOL, USDC, 'invalid'], resolveSource, download, now };
  assert.deepEqual(await syncTokenLogos(options), { created: 1, refreshed: 0, skipped: 1, failed: 0 });
  assert.equal(resolveSource.mock.callCount(), 1);
  assert.equal(writes.mock.calls[0].arguments[0], USDC);
  assert.deepEqual(await syncTokenLogos({ ...options, now: now + 1 }), { created: 0, refreshed: 1, skipped: 1, failed: 0 });
});

test('failed refreshes keep existing images and missing images retry on the next scan', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const inventory = new Map([[SOL, new Date(now - TOKEN_LOGO_REFRESH_MS)]]);
  const storage = fakeStorage(inventory);
  const writes = t.mock.method(storage, 'put');
  const options = { storage, mints: [SOL, USDC], resolveSource: async () => 'https://example.com/logo', now };
  const failed = await syncTokenLogos({ ...options, download: async () => { throw new Error('timeout'); } });
  assert.deepEqual(failed, { created: 0, refreshed: 0, skipped: 0, failed: 2 });
  assert.equal(writes.mock.callCount(), 0);
  assert.equal(inventory.get(SOL)?.getTime(), now - TOKEN_LOGO_REFRESH_MS);
  assert.deepEqual(await syncTokenLogos({ ...options, download: async () => Buffer.from('ok') }),
    { created: 1, refreshed: 1, skipped: 0, failed: 0 });
});

test('worker skips generic placeholders and missing metadata', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const storage = fakeStorage();
  const download = t.mock.fn(async () => Buffer.alloc(0));
  const result = await syncTokenLogos({ storage, mints: [SOL, USDC], now, download,
    resolveSource: async (mint) => mint === SOL ? 'https://placehold.net/400x400.png' : null });
  assert.equal(result.failed, 2);
  assert.equal(download.mock.callCount(), 0);
});

test('worker stops starting downloads when shutting down', async () => {
  const result = await syncTokenLogos({ storage: fakeStorage(), mints: [SOL], now,
    resolveSource: async () => { throw new Error('must not run'); }, shouldStop: () => true });
  assert.deepEqual(result, { created: 0, refreshed: 0, skipped: 0, failed: 0 });
});

test('download produces a 128px WebP with transparent padding using safe fetch', async (t) => {
  const png = await sharp({ create: { width: 32, height: 16, channels: 4, background: '#ff0000' } }).png().toBuffer();
  const fetch = t.mock.method(fetcher, 'safeFetch', async (_url: string, options: fetcher.SafeFetchOptions) => {
    assert.equal(options.requireImage, true);
    assert.equal(options.maxBytes, 5 * 1024 * 1024);
    return { ok: true, status: 200, contentType: 'image/png', body: png };
  });
  const image = await downloadTokenLogo('ipfs://test/logo.png');
  assert.match(fetch.mock.calls[0].arguments[0], /^https:.*\/ipfs\/test\/logo.png$/);
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 128);
  assert.equal(metadata.height, 128);
  assert.equal(metadata.hasAlpha, true);
  const raw = await sharp(image).ensureAlpha().raw().toBuffer();
  assert.equal(raw[3], 0);
});

test('download rejects image bodies that cannot be decoded', async (t) => {
  t.mock.method(fetcher, 'safeFetch', async () => ({ ok: true, status: 200, contentType: 'image/png', body: Buffer.from('broken') }));
  await assert.rejects(downloadTokenLogo('https://example.com/logo.png'));
});

test('S3 adapter stores deterministic WebP objects with one-day cache headers', async (t) => {
  const image = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#fff' } }).webp().toBuffer();
  const send = t.mock.method(S3Client.prototype, 'send', async (command: PutObjectCommand) => {
    assert.ok(command instanceof PutObjectCommand);
    assert.equal(command.input.Key, `logos/${SOL}.webp`);
    assert.equal(command.input.ContentType, 'image/webp');
    assert.equal(command.input.CacheControl, 'public, max-age=86400');
    return {};
  });
  const storage = new S3TokenLogoStorage(config);
  t.after(() => storage.close());
  await storage.put(SOL, image);
  await assert.rejects(storage.put(SOL, Buffer.from('<script>')), /Invalid/);
  assert.equal(send.mock.callCount(), 1);
});

test('S3 reads distinguish missing images from bucket failures and reject oversized bodies', async (t) => {
  let mode = 'missing';
  t.mock.method(S3Client.prototype, 'send', async (command: GetObjectCommand) => {
    assert.ok(command instanceof GetObjectCommand);
    if (mode === 'large') return { Body: Readable.from([Buffer.alloc(TOKEN_LOGO_MAX_BYTES + 1)]) };
    throw Object.assign(new Error(mode), { name: mode === 'missing' ? 'NoSuchKey' : 'AccessDenied' });
  });
  const storage = new S3TokenLogoStorage(config);
  t.after(() => storage.close());
  assert.equal(await storage.get(SOL), null);
  mode = 'offline';
  await assert.rejects(storage.get(SOL), /offline/);
  mode = 'large';
  await assert.rejects(storage.get(SOL), /size limit/);
});

test('HTTP logo delivery supports GET, HEAD, conditional requests, and cross-origin images', async (t) => {
  const image = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#fff' } }).webp().toBuffer();
  const storage = fakeStorage();
  t.mock.method(storage, 'get', async () => ({ body: image, etag: '"version1"', lastModified: new Date(now) }));
  t.mock.method(logoServices, 'getTokenLogoService', () => new logoServices.TokenLogoService(storage, config.apiOrigin));
  const base = await listen(t);
  const response = await fetch(`${base}/api/v1/tokens/${SOL}/icon`, { headers: { Origin: 'https://app.example.com' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.equal(response.headers.get('ratelimit-limit'), '600');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), image);
  const conditional = await fetch(`${base}/api/v1/tokens/${SOL}/icon`, { headers: { 'If-None-Match': '"version1"', 'Cache-Control': 'max-age=0' } });
  assert.equal(conditional.status, 304);
  assert.equal((await conditional.arrayBuffer()).byteLength, 0);
  const head = await fetch(`${base}/api/v1/tokens/${SOL}/icon`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
});

test('disabled, missing, invalid, and unavailable logos never get a one-day error cache', async (t) => {
  t.mock.method(console, 'error', () => {});
  const storage = fakeStorage();
  const service = new logoServices.TokenLogoService(storage, config.apiOrigin);
  const getter = t.mock.method(logoServices, 'getTokenLogoService', () => null as logoServices.TokenLogoService | null);
  const base = await listen(t);
  async function check(mint: string, expected: number) {
    const response = await fetch(`${base}/api/v1/tokens/${mint}/icon`);
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.arrayBuffer();
  }
  await check(SOL, 404);
  await check('invalid', 400);
  getter.mock.mockImplementation(() => service);
  await check(SOL, 404);
  t.mock.method(storage, 'get', async () => { throw new Error('bucket offline'); });
  await check(SOL, 503);
});
