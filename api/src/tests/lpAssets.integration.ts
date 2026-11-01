import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createLpAssetsRouter } from '../routes/v1/lpAssetsRoutes';
import { LpAssetStore, LeaseLost } from '../services/lpAssets/store';
import { IconResult, jobKeys, MAX_ATTEMPTS, parsePairInput, PermanentLpError } from '../services/lpAssets/model';
import { LpAssetDependencies, processAssetJob } from '../services/lpAssets/worker';

// Explicit test-only URL, never DATABASE_URL. Each run owns a disposable schema.
const connectionString = process.env.LP_ASSETS_TEST_DATABASE_URL;
if (!connectionString) throw new Error('LP_ASSETS_TEST_DATABASE_URL must point to an isolated test database');

test('PostgreSQL LP job queue integration', async (t) => {
  const admin = new Pool({ connectionString });
  const schema = `lp_assets_test_${process.pid}_${Date.now()}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const db = new Pool({ connectionString, options: `-c search_path=${schema}`, max: 20 });
  t.after(async () => { await db.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  const migration = readFileSync(path.join(__dirname, '../../../database/migrations/018_add_lp_asset_jobs.sql'), 'utf8');
  await db.query(migration);
  await db.query(migration); // migration is safe to apply again
  const store = new LpAssetStore(db);
  const otherInstance = new LpAssetStore(db);
  const pair = parsePairInput({ token0: 'So11111111111111111111111111111111111111112', token1: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' });
  const keys = jobKeys(pair);
  const icon: IconResult = { imageUrl: 'https://example.com/ipfs/image', tokens: [{ name: 'Solana', symbol: 'SOL' }, { name: 'USD Coin', symbol: 'USDC' }] };
  const reset = async () => { await db.query('TRUNCATE lp_asset_jobs'); };
  const expire = async (key: string) => { await db.query(`UPDATE lp_asset_jobs SET lease_until = now() - interval '1 second' WHERE key = $1`, [key]); };

  await t.test('concurrent API instances atomically create and join one pair of jobs', async () => {
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => (i % 2 ? store : otherInstance).enqueue(pair)));
    assert.equal(new Set(results).size, 1);
    assert.equal((await db.query('SELECT * FROM lp_asset_jobs')).rowCount, 2);
    const claims = await Promise.all(Array.from({ length: 16 }, () => otherInstance.claim()));
    assert.equal(claims.filter(Boolean).length, 1);
    const job = claims.find(Boolean)!;
    assert.equal(job.kind, 'icon');
    await store.complete(job, icon);
    const metadata = (await otherInstance.claim())!;
    assert.equal(metadata.kind, 'metadata');
    await store.complete(metadata, { imageUrl: icon.imageUrl, metadataUrl: 'https://example.com/ipfs/metadata', metadata: { name: 'LP', symbol: 'LP', description: 'pool', image: icon.imageUrl } });
    assert.equal(await store.enqueue(pair), results[0]);
    assert.equal(await store.claim(), null);
    assert.equal((await store.get(results[0]))?.state, 'ready');
  });

  await t.test('expired leases recover atomically and stale owners cannot heartbeat/write/fail', async () => {
    await reset(); await store.enqueue(pair);
    const old = (await store.claim())!;
    await expire(old.key);
    const next = (await otherInstance.claim())!;
    assert.notEqual(next.lease_token, old.lease_token);
    for (const operation of [() => store.renew(old), () => store.checkpoint(old, icon), () => store.complete(old, icon), () => store.fail(old, false)]) {
      await assert.rejects(operation(), LeaseLost);
    }
    await store.renew(next);
    assert.equal(await store.claim(), null);
    await store.complete(next, icon);
  });

  await t.test('failure backoff is durable and permanently failed icons propagate to metadata status', async () => {
    await reset(); await store.enqueue(pair);
    const job = (await store.claim())!;
    await store.fail(job, false);
    assert.equal(await store.claim(), null);
    assert.equal((await store.get(keys.metadata))?.state, 'queued');
    await db.query('UPDATE lp_asset_jobs SET available_at = now()');
    const retry = (await store.claim())!;
    assert.equal(retry.attempts, 2);
    await store.fail(retry, true);
    assert.equal((await store.get(keys.metadata))?.state, 'failed');
    assert.equal((await store.get(keys.metadata))?.error_code, 'invalid_mint');
    await store.enqueue(pair);
    assert.equal(await store.claim(), null);
  });

  await t.test('a crash on the final attempt is retired without leaving polling clients stuck', async () => {
    await reset(); await store.enqueue(pair);
    const job = (await store.claim())!;
    await db.query('UPDATE lp_asset_jobs SET attempts = $1 WHERE key = $2', [MAX_ATTEMPTS, job.key]);
    await expire(job.key);
    assert.equal(await store.claim(), null);
    assert.equal((await store.get(keys.metadata))?.error_code, 'retry_exhausted');
  });

  await t.test('checkpointed upload survives process death and retries without another upload', async () => {
    await reset(); await store.enqueue(pair);
    const job = (await store.claim())!;
    await store.checkpoint(job, icon);
    await expire(job.key);
    const recovered = (await store.claim())!;
    const forbidden = async (): Promise<never> => { throw new Error('Checkpoint should avoid external work'); };
    await processAssetJob(store, recovered, { resolve: forbidden, render: forbidden, upload: forbidden });
    assert.deepEqual((await store.get(job.key))?.result, icon);
    assert.equal((await store.get(job.key))?.state, 'ready');
  });

  await t.test('metadata failure and additional metadata version reuse the durable icon', async () => {
    await reset(); await store.enqueue(pair);
    let icons = 0; let metadataUploads = 0; let failMetadata = true;
    const deps: LpAssetDependencies = {
      resolve: async (mint) => icon.tokens[mint === pair.token0 ? 0 : 1],
      render: async () => Buffer.from('generated png fixture'),
      upload: async (kind, _input, body) => {
        if (kind === 'icon') { icons++; return icon.imageUrl; }
        metadataUploads++;
        assert.equal(JSON.parse(body.toString()).name, 'SOL/USDC omLP');
        if (failMetadata) throw new Error('temporary provider error');
        return 'https://example.com/ipfs/metadata';
      },
    };
    await processAssetJob(store, (await store.claim())!, deps);
    await processAssetJob(store, (await store.claim())!, deps);
    assert.equal(icons, 1); assert.equal(metadataUploads, 1);
    failMetadata = false;
    await db.query('UPDATE lp_asset_jobs SET available_at = now()');
    await processAssetJob(store, (await store.claim())!, deps);
    assert.equal(icons, 1); assert.equal(metadataUploads, 2);
    assert.equal((await store.get(keys.metadata))?.state, 'ready');
    // Current JSON has no risk settings; independent metadata-version rows prove
    // the same icon can be reused if content-affecting settings are added later.
    const variant = jobKeys(pair, 'metadata-v2').metadata;
    await db.query(`INSERT INTO lp_asset_jobs (key, kind, input, dependency_key) VALUES ($1, 'metadata', $2, $3)`, [variant, pair, keys.icon]);
    await processAssetJob(store, (await store.claim())!, deps);
    assert.equal(icons, 1); assert.equal(metadataUploads, 3);
  });

  await t.test('invalid mint never reaches renderer or upload', async () => {
    await reset(); await store.enqueue(pair);
    let called = false;
    await processAssetJob(store, (await store.claim())!, {
      resolve: async () => { throw new PermanentLpError('Invalid mint'); },
      render: async () => { called = true; return Buffer.alloc(0); },
      upload: async () => { called = true; return ''; },
    });
    assert.equal(called, false);
    assert.equal((await store.get(keys.metadata))?.state, 'failed');
  });

  await t.test('concurrent HTTP callers wait for one worker result then receive the same cached URI', async (subtest) => {
    await reset();
    const app = express().use(express.json()).use(createLpAssetsRouter(store, () => true));
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    subtest.after(() => { server.closeAllConnections(); server.close(); });
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let uploads = 0;
    const deps: LpAssetDependencies = {
      resolve: async (mint) => icon.tokens[mint === pair.token0 ? 0 : 1],
      render: async () => Buffer.from('generated png fixture'),
      upload: async (kind) => { uploads++; return `https://example.com/ipfs/${kind}`; },
    };
    const requests = Array.from({ length: 12 }, () => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pair),
    }));
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && (await store.get(keys.metadata))?.state !== 'ready') {
      const job = await otherInstance.claim();
      if (job) await processAssetJob(otherInstance, job, deps);
      else await new Promise((resolve) => setTimeout(resolve, 10));
    }
    for (const response of await Promise.all(requests)) {
      assert.equal(response.status, 200);
      const body = await response.json() as { metadataUrl: string; jobId: string };
      assert.equal(body.metadataUrl, 'https://example.com/ipfs/metadata');
      assert.equal(body.jobId, keys.metadata);
    }
    assert.equal(uploads, 2);
    assert.equal((await db.query('SELECT * FROM lp_asset_jobs')).rowCount, 2);
  });
});
