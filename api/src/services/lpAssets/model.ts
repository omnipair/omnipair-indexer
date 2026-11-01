import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { isTokenMint } from '../tokenLogoStorage';

export const GENERATOR_VERSION = 'lp-v1';
export const METADATA_VERSION = 'metadata-v1';
export const MAX_ATTEMPTS = 5;
export const LEASE_SECONDS = 120;
export interface PairInput { token0: string; token1: string }
export interface TokenIdentity { name: string; symbol: string; iconUrl?: string }
export interface LpMetadata { name: string; symbol: string; description: string; image: string }
export interface IconResult { imageUrl: string; tokens: [TokenIdentity, TokenIdentity] }
export interface MetadataResult { metadataUrl: string; imageUrl: string; metadata: LpMetadata }
export class InvalidLpRequest extends Error {}
export class PermanentLpError extends Error {}

export function parsePairInput(input: unknown): PairInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',') !== 'token0,token1') {
    throw new InvalidLpRequest('Expected only token0 and token1 mint addresses');
  }
  const { token0, token1 } = input as PairInput;
  if (typeof token0 !== 'string' || typeof token1 !== 'string'
    || !isTokenMint(token0) || !isTokenMint(token1) || token0 === token1) {
    throw new InvalidLpRequest('Expected two distinct canonical Solana mint addresses');
  }
  // CreatePools/useInitializePool order by raw public-key bytes, not base58 text.
  return Buffer.compare(new PublicKey(token0).toBuffer(), new PublicKey(token1).toBuffer()) < 0
    ? { token0, token1 } : { token0: token1, token1: token0 };
}

export function jobKeys(pair: PairInput, metadataVersion = METADATA_VERSION) {
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const icon = hash([GENERATOR_VERSION, pair.token0, pair.token1]);
  // No market/risk setting affects today's webapp JSON. A future content change
  // must version metadata and include its normalized settings here, independently of icons.
  return { icon, metadata: hash([metadataVersion, icon, {}]) };
}

export function boundedText(value: unknown, fallback: string, maxBytes: number): string {
  const clean = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
  let result = '';
  for (const char of clean || fallback) {
    if (Buffer.byteLength(result + char, 'utf8') > maxBytes) break;
    result += char;
  }
  return result;
}

export function createMetadata(tokens: [TokenIdentity, TokenIdentity], image: string): LpMetadata {
  const [a, b] = tokens;
  return {
    name: boundedText(`${a.symbol}/${b.symbol} omLP`, 'omLP', 32),
    symbol: boundedText(`${a.symbol.slice(0, 2).toUpperCase()}.${b.symbol.slice(0, 2).toUpperCase()}-omLP`, 'omLP', 10),
    description: `Omnipair LP token for ${a.name}/${b.name} pool`,
    image,
  };
}
