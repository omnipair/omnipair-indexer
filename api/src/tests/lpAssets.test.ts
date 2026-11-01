import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Connection, PublicKey } from '@solana/web3.js';
import { MintLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import sharp from 'sharp';
import { readLpAssetConfig } from '../config/lpAssets';
import { boundedText, createMetadata, jobKeys, parsePairInput, PermanentLpError } from '../services/lpAssets/model';
import { composeIcon, placeholder, tokenPng } from '../services/lpAssets/render';
import { LpPinataUploader } from '../services/lpAssets/pinata';
import { LpTokenResolver, readBoundedResponse, verifyMainnet } from '../services/lpAssets/upstream';
import { createLpAssetsRouter } from '../routes/v1/lpAssetsRoutes';
import { AssetJob, LeaseLost, LpAssetStore } from '../services/lpAssets/store';
import { processAssetJob } from '../services/lpAssets/worker';
import * as fetcher from '../utils/safeFetch';

const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const pair = parsePairInput({ token0: USDC, token1: SOL });
const config = { rpcUrl: 'https://rpc.example.com/', gatewayOrigin: 'https://gateway.pinata.cloud', pinataJwt: 'test-only', concurrency: 2 };
const env = { LP_ASSETS_ENABLED: 'true', LP_ASSETS_MAINNET_RPC_URL: config.rpcUrl,
  LP_ASSETS_GATEWAY_ORIGIN: config.gatewayOrigin, LP_ASSETS_PINATA_JWT: config.pinataJwt };
const tokens: [{ name: string; symbol: string }, { name: string; symbol: string }] = [
  { name: 'Solana', symbol: 'SOL' }, { name: 'USD Coin', symbol: 'USDC' },
];

test('LP feature defaults off and rejects incomplete/unsafe configuration', () => {
  assert.equal(readLpAssetConfig({}), null);
  assert.deepEqual(readLpAssetConfig(env), config);
  assert.throws(() => readLpAssetConfig({ LP_ASSETS_ENABLED: 'true' }));
  for (const gateway of ['http://example.com', 'https://a:b@example.com', 'https://example.com/path', `https://${'a'.repeat(60)}.com`]) {
    assert.throws(() => readLpAssetConfig({ ...env, LP_ASSETS_GATEWAY_ORIGIN: gateway }));
  }
  for (const concurrency of ['0', '5', '1.5', 'no']) assert.throws(() => readLpAssetConfig({ ...env, LP_ASSETS_WORKER_CONCURRENCY: concurrency }));
});

test('LP request accepts only distinct canonical mints and normalizes raw-byte order', () => {
  assert.deepEqual(pair, { token0: SOL, token1: USDC });
  assert.deepEqual(parsePairInput({ token0: SOL, token1: USDC }), pair);
  for (const invalid of [null, [], {}, { ...pair, network: 'mainnet' }, { ...pair, risk: 1 },
    { ...pair, file: 'bytes' }, { ...pair, image: 'https://example.com' }, { ...pair, keyvalues: {} },
    { ...pair, token0: SOL + ' ' }, { ...pair, token0: '111' }, { token0: SOL, token1: SOL }]) {
    assert.throws(() => parsePairInput(invalid));
  }
});

test('cache keys preserve composition and separate metadata versions from the icon', () => {
  const current = jobKeys(pair);
  assert.deepEqual(jobKeys(parsePairInput({ token0: USDC, token1: SOL })), current);
  const changedMetadata = jobKeys(pair, 'metadata-v2');
  assert.equal(changedMetadata.icon, current.icon);
  assert.notEqual(changedMetadata.metadata, current.metadata);
});

test('metadata matches existing webapp schema, names, symbol, and description', () => {
  assert.deepEqual(createMetadata(tokens, 'https://gateway.example/ipfs/cid'), {
    name: 'SOL/USDC omLP', symbol: 'SO.US-omLP',
    description: 'Omnipair LP token for Solana/USD Coin pool', image: 'https://gateway.example/ipfs/cid',
  });
  const large = { name: boundedText('n'.repeat(200), '', 96), symbol: boundedText('🪙'.repeat(50), '', 32) };
  const metadata = createMetadata([large, large], 'https://example.com/ipfs/cid');
  assert.ok(Buffer.byteLength(metadata.name) <= 32);
  assert.ok(Buffer.byteLength(metadata.symbol) <= 10);
  assert.ok(JSON.stringify(metadata).length < 4096);
  assert.equal(boundedText('\0ABC\n', 'Unknown', 32), 'ABC');
});

test('PNG composition preserves half-circle order, square stretch, and transparency', async (t) => {
  const red = await sharp({ create: { width: 40, height: 80, channels: 4, background: '#ff0000' } }).png().toBuffer();
  const blue = await sharp({ create: { width: 80, height: 40, channels: 4, background: '#0000ff' } }).png().toBuffer();
  t.mock.method(fetcher, 'safeFetch', async (url: string) => ({ ok: true, status: 200, contentType: 'image/png', body: url.endsWith('red') ? red : blue }));
  const body = await composeIcon([{ ...tokens[0], iconUrl: 'https://example.com/red' }, { ...tokens[1], iconUrl: 'https://example.com/blue' }]);
  const { data, info } = await sharp(body).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 128); assert.equal(info.height, 128); assert.equal(info.channels, 4);
  const pixel = (x: number, y: number) => [...data.subarray((y * 128 + x) * 4, (y * 128 + x + 1) * 4)];
  assert.deepEqual(pixel(32, 64), [255, 0, 0, 255]);
  assert.deepEqual(pixel(96, 64), [0, 0, 255, 255]);
  assert.equal(pixel(0, 0)[3], 0);
});

test('untrusted SVG, malformed raster and oversized dimensions fall back to escaped initials', async (t) => {
  const token = { ...tokens[0], iconUrl: 'https://example.com/image' };
  const expected = await placeholder(token.symbol);
  const mock = t.mock.method(fetcher, 'safeFetch', async () => ({ ok: true, status: 200, contentType: 'image/svg+xml', body: Buffer.from('<svg/>') }));
  assert.deepEqual(await tokenPng(token), expected);
  mock.mock.mockImplementation(async () => ({ ok: true, status: 200, contentType: 'image/png', body: Buffer.from('invalid') }));
  assert.deepEqual(await tokenPng(token), expected);
  const oversized = await sharp({ create: { width: 9000, height: 1, channels: 4, background: 'red' } }).png().toBuffer();
  mock.mock.mockImplementation(async () => ({ ok: true, status: 200, contentType: 'image/png', body: oversized }));
  assert.deepEqual(await tokenPng(token), expected);
  assert.equal((await sharp(await placeholder('<&')).metadata()).format, 'png');
});

test('Pinata uploads use fixed endpoint, public network, bounded canonical form and compatible URI', async (t) => {
  const cid = `baf${'a'.repeat(56)}`;
  const upload = t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(url, 'https://uploads.pinata.cloud/v3/files');
    assert.equal(options.redirect, 'error');
    const form = options.body as FormData;
    assert.equal(form.get('network'), 'public');
    const file = form.get('file') as File;
    assert.equal(file.type, 'application/json');
    assert.equal(file.name, `lp-metadata-${SOL.slice(0, 8)}-${USDC.slice(0, 8)}.json`);
    assert.deepEqual(JSON.parse(await file.text()), createMetadata(tokens, 'https://example.com/image'));
    return new Response(JSON.stringify({ data: { cid } }));
  });
  const uploader = new LpPinataUploader(config);
  assert.equal(await uploader.upload('metadata', pair, Buffer.from(JSON.stringify(createMetadata(tokens, 'https://example.com/image'))), new AbortController().signal), `${config.gatewayOrigin}/ipfs/${cid}`);
  assert.equal(upload.mock.callCount(), 1);
  await assert.rejects(uploader.upload('metadata', pair, Buffer.alloc(5000), new AbortController().signal));
  upload.mock.mockImplementation(async () => new Response(JSON.stringify({ data: { cid: '../arbitrary/path' } })));
  await assert.rejects(uploader.upload('icon', pair, Buffer.from('test'), new AbortController().signal), /CID/);
});

test('trusted-service response sizes are bounded', async () => {
  await assert.rejects(readBoundedResponse(new Response('a'.repeat(100)), 20), /large/);
  assert.equal((await readBoundedResponse(new Response('ok'), 20)).toString(), 'ok');
});

test('worker rejects non-mainnet RPC before doing generation', async () => {
  await assert.rejects(verifyMainnet({ getGenesisHash: async () => 'devnet' } as unknown as Connection), /mainnet/);
  await assert.rejects(verifyMainnet({ getGenesisHash: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' } as unknown as Connection), /mainnet/);
  await verifyMainnet({ getGenesisHash: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' } as unknown as Connection);
});

test('resolver reads canonical on-chain identity and only the image field from bounded external JSON', async (t) => {
  const data = Buffer.alloc(82);
  MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 0n,
    decimals: 9, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, data);
  const metadata = getMetadataAccountDataSerializer().serialize({
    updateAuthority: publicKey(SOL), mint: publicKey(SOL), name: 'Solana\0', symbol: 'SOL\0', uri: 'https://example.com/metadata',
    sellerFeeBasisPoints: 0, creators: null, primarySaleHappened: false, isMutable: false,
    editionNonce: null, tokenStandard: null, collection: null, uses: null, collectionDetails: null, programmableConfig: null,
  });
  const resolver = new LpTokenResolver({ getMultipleAccountsInfo: async () => [
    { owner: TOKEN_PROGRAM_ID, executable: false, data },
    { owner: new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'), data: Buffer.from(metadata) },
  ] } as unknown as Connection);
  t.mock.method(fetcher, 'safeFetch', async (url: string, options: fetcher.SafeFetchOptions) => {
    assert.equal(url, 'https://example.com/metadata');
    assert.equal(options.maxBytes, 256 * 1024); assert.equal(options.timeoutMs, 10_000);
    return { ok: true, status: 200, contentType: 'application/json', body: Buffer.from(JSON.stringify({
      name: 'Untrusted custom name', symbol: 'CUSTOM', description: 'custom', image: 'https://example.com/icon',
    })) };
  });
  assert.deepEqual(await resolver.resolve(SOL), { name: 'Solana', symbol: 'SOL', iconUrl: 'https://example.com/icon' });
});

test('resolver rejects nonexistent, wrong-owner and malformed mint accounts', async () => {
  for (const info of [null, { owner: PublicKey.default, executable: false, data: Buffer.alloc(82) },
    { owner: TOKEN_PROGRAM_ID, executable: false, data: Buffer.alloc(10) }]) {
    const resolver = new LpTokenResolver({ getMultipleAccountsInfo: async () => [info, null] } as unknown as Connection);
    await assert.rejects(resolver.resolve(SOL), PermanentLpError);
  }
  const data = Buffer.alloc(82);
  MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 0n,
    decimals: 9, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, data);
  const resolver = new LpTokenResolver({ getMultipleAccountsInfo: async () => [{ owner: TOKEN_PROGRAM_ID, executable: false, data }, null] } as unknown as Connection);
  assert.deepEqual(await resolver.resolve(SOL), { name: 'Unknown', symbol: 'Unknown', iconUrl: undefined });
});

test('worker does not upload when lease ownership is lost before upload', async () => {
  let renewals = 0; let uploads = 0;
  const store = { renew: async () => { if (++renewals === 2) throw new LeaseLost(); } } as unknown as LpAssetStore;
  await processAssetJob(store, { kind: 'icon', input: pair } as AssetJob, {
    resolve: async () => tokens[0], render: async () => Buffer.from('png'), upload: async () => { uploads++; return 'url'; },
  });
  assert.equal(uploads, 0);
});

test('route is opt-in, validates strict body, joins existing jobs and exposes only metadata jobs', async (t) => {
  const key = jobKeys(pair).metadata;
  let enabled = false; let enqueueCount = 0;
  let job = { key, kind: 'metadata', state: 'queued' } as AssetJob;
  const store = { enqueue: async () => { enqueueCount++; return key; }, get: async () => job } as unknown as LpAssetStore;
  const app = express().use(express.json()).use('/api/v1/lp-assets', createLpAssetsRouter(store, () => enabled, 0));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/lp-assets`;
  const post = (body: unknown) => fetch(origin, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post(pair)).status, 503); assert.equal(enqueueCount, 0);
  enabled = true;
  assert.equal((await post({ ...pair, image: 'https://example.com' })).status, 400); assert.equal(enqueueCount, 0);
  const response = await post(pair);
  assert.equal(response.status, 202); assert.equal(response.headers.get('retry-after'), '3');
  assert.equal(((await response.json()) as { jobId: string }).jobId, key);
  job = { ...job, state: 'ready', result: { imageUrl: 'image', metadataUrl: 'uri', metadata: createMetadata(tokens, 'image') } };
  assert.equal((await post(pair)).status, 200);
  assert.equal((await fetch(`${origin}/${key}`)).status, 200);
  job = { ...job, kind: 'icon' };
  assert.equal((await fetch(`${origin}/${key}`)).status, 404);
  assert.equal((await fetch(`${origin}/invalid`)).status, 400);
});
