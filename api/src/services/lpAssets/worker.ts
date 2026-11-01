import { AssetJob, LeaseLost, LpAssetStore } from './store';
import { createMetadata, IconResult, MetadataResult, PairInput, PermanentLpError, TokenIdentity } from './model';

export interface LpAssetDependencies {
  resolve(mint: string): Promise<TokenIdentity>;
  render(tokens: [TokenIdentity, TokenIdentity]): Promise<Buffer>;
  upload(kind: 'icon' | 'metadata', input: PairInput, body: Buffer, signal: AbortSignal): Promise<string>;
}

export async function processAssetJob(store: LpAssetStore, job: AssetJob, deps: LpAssetDependencies): Promise<void> {
  const abort = new AbortController();
  let renewal: Promise<void> = Promise.resolve();
  const heartbeat = setInterval(() => {
    renewal = renewal.then(() => store.renew(job)).catch(() => { abort.abort(); });
  }, 20_000);
  const guard = async () => { abort.signal.throwIfAborted(); await store.renew(job); abort.signal.throwIfAborted(); };
  try {
    let result = job.artifact;
    if (!result) {
      await guard();
      if (job.kind === 'icon') {
        const tokens: [TokenIdentity, TokenIdentity] = [await deps.resolve(job.input.token0), await deps.resolve(job.input.token1)];
        const png = await deps.render(tokens);
        await guard();
        const imageUrl = await deps.upload('icon', job.input, png, abort.signal);
        // Retain canonical identities with the icon; strip untrusted source URLs.
        result = { imageUrl, tokens: tokens.map(({ name, symbol }) => ({ name, symbol })) as [TokenIdentity, TokenIdentity] };
      } else {
        const icon = await store.get(job.dependency_key!);
        if (icon?.state !== 'ready' || !icon.result) throw new Error('Icon is not ready');
        const { imageUrl, tokens } = icon.result as IconResult;
        const metadata = createMetadata(tokens, imageUrl);
        await guard();
        const metadataUrl = await deps.upload('metadata', job.input, Buffer.from(JSON.stringify(metadata, null, 2)), abort.signal);
        result = { metadataUrl, imageUrl, metadata } satisfies MetadataResult;
      }
      await store.checkpoint(job, result);
    }
    await store.complete(job, result);
  } catch (error) {
    if (!(error instanceof LeaseLost) && !abort.signal.aborted) {
      try { await store.fail(job, error instanceof PermanentLpError); }
      catch (failure) { if (!(failure instanceof LeaseLost)) throw failure; }
    }
    // Never log upstream bodies/URLs/errors: RPC queries and provider errors may contain credentials.
  } finally { clearInterval(heartbeat); await renewal; }
}
