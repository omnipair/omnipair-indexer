import { Router } from 'express';
import pool from '../../config/database';
import { readLpAssetConfig } from '../../config/lpAssets';
import { InvalidLpRequest, parsePairInput } from '../../services/lpAssets/model';
import { AssetJob, LpAssetStore } from '../../services/lpAssets/store';

export function lpAssetResponse(job: AssetJob) {
  return {
    success: job.state !== 'failed', jobId: job.key,
    status: job.state === 'ready' ? 'ready' : job.state === 'failed' ? 'failed' : 'processing',
    ...(job.state === 'ready' ? job.result : {}),
    ...(job.state === 'failed' ? { error: job.error_code || 'generation_failed' } : {}),
  };
}

export function createLpAssetsRouter(store = new LpAssetStore(pool), configured = () => !!readLpAssetConfig(), waitMs = 3000): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (configured()) { next(); return; }
    } catch { /* Invalid configuration disables only this feature. */ }
    res.status(503).json({ success: false, error: 'lp_assets_unavailable' });
  });
  router.post('/', async (req, res) => {
    try {
      if (!req.is('application/json')) { res.status(415).json({ success: false, error: 'Expected application/json' }); return; }
      const input = parsePairInput(req.body);
      const key = await store.enqueue(input);
      const deadline = Date.now() + Math.min(3000, Math.max(0, waitMs));
      let job = await store.get(key);
      while (job && ['queued', 'processing'].includes(job.state) && Date.now() < deadline && !res.destroyed) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        job = await store.get(key);
      }
      if (res.destroyed) return;
      if (!job) throw new Error('Missing queued job');
      res.setHeader('Location', `/api/v1/lp-assets/${key}`);
      if (job.state !== 'ready' && job.state !== 'failed') res.setHeader('Retry-After', '3');
      res.status(job.state === 'ready' ? 200 : job.state === 'failed' ? 422 : 202).json(lpAssetResponse(job));
    } catch (error) {
      res.status(error instanceof InvalidLpRequest ? 400 : 503).json({ success: false,
        error: error instanceof InvalidLpRequest ? error.message : 'lp_assets_unavailable' });
    }
  });
  router.get('/:jobId', async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.jobId)) { res.status(400).json({ success: false, error: 'Invalid job ID' }); return; }
    try {
      const job = await store.get(req.params.jobId);
      if (!job || job.kind !== 'metadata') { res.status(404).json({ success: false, error: 'Job not found' }); return; }
      if (job.state !== 'ready' && job.state !== 'failed') res.setHeader('Retry-After', '3');
      res.status(job.state === 'ready' ? 200 : job.state === 'failed' ? 422 : 202).json(lpAssetResponse(job));
    } catch { res.status(503).json({ success: false, error: 'lp_assets_unavailable' }); }
  });
  return router;
}

export default createLpAssetsRouter();
