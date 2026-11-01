import { LpAssetConfig } from '../../config/lpAssets';
import { PairInput, GENERATOR_VERSION } from './model';
import { readBoundedResponse } from './upstream';

export class LpPinataUploader {
  constructor(private readonly config: LpAssetConfig) {}

  async upload(kind: 'icon' | 'metadata', pair: PairInput, body: Buffer, signal: AbortSignal): Promise<string> {
    const mime = kind === 'icon' ? 'image/png' : 'application/json';
    const name = `${kind === 'icon' ? 'lp' : 'lp-metadata'}-${pair.token0.slice(0, 8)}-${pair.token1.slice(0, 8)}.${kind === 'icon' ? 'png' : 'json'}`;
    if (body.length > (kind === 'icon' ? 256 * 1024 : 4096)) throw new Error('Generated asset too large');
    const form = new FormData();
    form.append('network', 'public');
    form.append('file', new Blob([new Uint8Array(body)], { type: mime }), name);
    form.append('name', name);
    form.append('keyvalues', JSON.stringify({ ...pair, type: kind === 'icon' ? 'lp-image' : 'lp-metadata', generator: GENERATOR_VERSION }));
    // Fixed provider endpoint: no caller-provided URLs, signed URLs, files or options.
    const response = await fetch('https://uploads.pinata.cloud/v3/files', {
      method: 'POST', redirect: 'error', body: form,
      headers: { Authorization: `Bearer ${this.config.pinataJwt}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('LP upload failed'); }
    const data = JSON.parse((await readBoundedResponse(response, 16 * 1024)).toString('utf8'));
    const cid: unknown = data?.data?.cid;
    if (typeof cid !== 'string' || !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,70})$/.test(cid)) throw new Error('Invalid upload CID');
    const url = `${this.config.gatewayOrigin}/ipfs/${cid}`;
    // Webapp transaction builder currently caps LP metadata URIs at 128 bytes.
    if (url.length > 128) throw new Error('LP asset URI exceeds 128 bytes');
    return url;
  }
}
