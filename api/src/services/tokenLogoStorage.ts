import { PublicKey } from '@solana/web3.js';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  TokenLogoConfig, TOKEN_LOGO_CACHE_CONTROL, TOKEN_LOGO_MAX_BYTES,
} from '../config/tokenLogos';

export interface StoredTokenLogo {
  body: Buffer;
  etag?: string;
  lastModified?: Date;
}

export interface TokenLogoStorage {
  list(): Promise<Map<string, Date>>;
  get(mint: string): Promise<StoredTokenLogo | null>;
  put(mint: string, body: Buffer): Promise<void>;
  close(): void;
}

export function isTokenMint(mint: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return false;
  try {
    return new PublicKey(mint).toBase58() === mint;
  } catch {
    return false;
  }
}

export function tokenLogoKey(mint: string): string {
  if (!isTokenMint(mint)) throw new Error('Invalid token mint');
  return `logos/${mint}.webp`;
}

function isWebp(body: Buffer): boolean {
  return body.length >= 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP';
}

export class S3TokenLogoStorage implements TokenLogoStorage {
  private readonly client: S3Client;

  constructor(private readonly config: TokenLogoConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: true,
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 3_000, requestTimeout: 10_000 },
    });
  }

  async list(): Promise<Map<string, Date>> {
    const logos = new Map<string, Date>();
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.config.bucket, Prefix: 'logos/', ContinuationToken: continuationToken,
      }), { abortSignal: AbortSignal.timeout(10_000) });
      for (const object of page.Contents ?? []) {
        const match = /^logos\/([^/]+)\.webp$/.exec(object.Key ?? '');
        if (match && isTokenMint(match[1]) && object.Size && object.Size <= TOKEN_LOGO_MAX_BYTES && object.LastModified) {
          logos.set(match[1], object.LastModified);
        }
      }
      if (page.IsTruncated && (!page.NextContinuationToken || page.NextContinuationToken === continuationToken)) {
        throw new Error('Token logo bucket returned invalid pagination');
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return logos;
  }

  async get(mint: string): Promise<StoredTokenLogo | null> {
    try {
      const object = await this.client.send(new GetObjectCommand({
        Bucket: this.config.bucket, Key: tokenLogoKey(mint),
      }), { abortSignal: AbortSignal.timeout(10_000) });
      const stream = object.Body as (NodeJS.ReadableStream & AsyncIterable<Uint8Array> & { destroy(): void }) | undefined;
      if (!stream) throw new Error('Token logo bucket returned an empty response');
      const timer = setTimeout(() => stream.destroy(), 10_000);
      try {
        if (object.ContentLength && object.ContentLength > TOKEN_LOGO_MAX_BYTES) {
          throw new Error('Stored token logo exceeds size limit');
        }
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of stream) {
          length += chunk.length;
          if (length > TOKEN_LOGO_MAX_BYTES) throw new Error('Stored token logo exceeds size limit');
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks);
        if (!isWebp(body)) throw new Error('Stored token logo is not WebP');
        return { body, etag: object.ETag, lastModified: object.LastModified };
      } finally {
        clearTimeout(timer);
        stream.destroy();
      }
    } catch (error) {
      if (error instanceof Error && (error.name === 'NoSuchKey' || error.name === 'NotFound')) return null;
      throw error;
    }
  }

  async put(mint: string, body: Buffer): Promise<void> {
    if (!isWebp(body) || body.length > TOKEN_LOGO_MAX_BYTES) throw new Error('Invalid token logo output');
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket, Key: tokenLogoKey(mint), Body: body,
      ContentType: 'image/webp', CacheControl: TOKEN_LOGO_CACHE_CONTROL,
    }), { abortSignal: AbortSignal.timeout(15_000) });
  }

  close(): void { this.client.destroy(); }
}
