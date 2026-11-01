import sharp from 'sharp';
import { safeFetch } from '../../utils/safeFetch';
import { resolveIpfsUrl } from '../../utils/ipfs';
import { TokenIdentity } from './model';

const SIZE = 128;
const MAX_PIXELS = 16 * 1024 * 1024;
const svg = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">${body}</svg>`);
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));

export async function placeholder(symbol: string): Promise<Buffer> {
  return sharp(svg(`<circle cx="64" cy="64" r="64" fill="#9b9b9b"/><text x="64" y="69.12" dominant-baseline="central" text-anchor="middle" font-family="sans-serif" font-size="51.2" font-weight="bold" fill="white">${escapeXml((symbol || 'UN').slice(0, 2).toUpperCase())}</text>`))
    .png().timeout({ seconds: 5 }).toBuffer();
}

export async function tokenPng(token: TokenIdentity): Promise<Buffer> {
  try {
    if (!token.iconUrl) throw new Error('No logo');
    const response = await safeFetch(resolveIpfsUrl(token.iconUrl), {
      timeoutMs: 10_000, maxBytes: 5 * 1024 * 1024, requireImage: true,
    });
    // Only bounded raster decoders see remote bytes. SVG can reference resources
    // and has unbounded vector complexity; initials are safer for unsupported formats.
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(response.contentType)) throw new Error('Unsupported logo');
    const image = sharp(response.body, { limitInputPixels: MAX_PIXELS, animated: false, failOn: 'error' });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 8192 || metadata.height > 8192
      || metadata.width * metadata.height > MAX_PIXELS || (metadata.pages || 1) > 100) throw new Error('Oversized logo');
    // Canvas drawImage used a full-square stretch in the webapp.
    return await image.resize(SIZE, SIZE, { fit: 'fill' }).png().timeout({ seconds: 5 }).toBuffer();
  } catch { return placeholder(token.symbol); }
}

export async function composeIcon(tokens: [TokenIdentity, TokenIdentity]): Promise<Buffer> {
  const [left, right] = await Promise.all(tokens.map(tokenPng));
  const [leftHalf, rightHalf] = await Promise.all([
    sharp(left).extract({ left: 0, top: 0, width: 64, height: SIZE }).png().toBuffer(),
    sharp(right).extract({ left: 64, top: 0, width: 64, height: SIZE }).png().toBuffer(),
  ]);
  const circle = svg('<circle cx="64" cy="64" r="63" fill="white"/>');
  const border = svg('<circle cx="64" cy="64" r="63" fill="none" stroke="white" stroke-opacity="0.12" stroke-width="2"/>');
  const clipped = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: '#00000000' } })
    .composite([{ input: leftHalf, left: 0, top: 0 }, { input: rightHalf, left: 64, top: 0 }, { input: circle, blend: 'dest-in' }])
    .png().timeout({ seconds: 5 }).toBuffer();
  return sharp(clipped).composite([{ input: border }]).png().timeout({ seconds: 5 }).toBuffer();
}
