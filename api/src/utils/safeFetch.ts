import * as dns from 'node:dns/promises';
import type { LookupAddress, LookupOptions } from 'node:dns';
import * as https from 'node:https';
import type * as net from 'node:net';

/**
 * Hardened outbound fetch for attacker-controlled URLs.
 *
 * Token metadata URIs come from on-chain Metaplex accounts and the `image`
 * field of the JSON they point at. Minting an SPL token is permissionless, so
 * both values are fully attacker-controlled and must never be handed to a bare
 * `fetch`. This helper enforces, on every hop:
 *
 *   - https only
 *   - the hostname resolves entirely to public addresses
 *   - the socket connects to the exact address that was validated
 *   - redirects are followed manually and re-validated
 *   - the response is size-capped, and optionally must sniff as an image
 *
 * The connection is pinned via a custom `lookup` rather than by rewriting the
 * URL to an IP literal, so TLS SNI and certificate validation still run
 * against the real hostname. Node's global `fetch` cannot express this, hence
 * the use of `node:https` directly.
 */

const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export interface SafeFetchOptions {
  /** Overall deadline across every redirect hop, not per-request. */
  timeoutMs: number;
  maxBytes: number;
  maxRedirects?: number;
  /** Reject bodies that do not sniff as a known image format. */
  requireImage?: boolean;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  /** Sniffed type when `requireImage` is set, otherwise the response header. */
  contentType: string;
  body: Buffer;
}

// Everything that is not globally routable unicast. 255.255.255.255 falls
// inside 240.0.0.0/4, and the cloud metadata address (169.254.169.254, used by
// AWS, GCP, Azure and Alibaba) inside 169.254.0.0/16.
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_V6: ReadonlyArray<readonly [string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];

function parseIPv4(text: string): Uint8Array | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;

  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parts[i])) return null;
    const value = Number(parts[i]);
    if (value > 255) return null;
    bytes[i] = value;
  }
  return bytes;
}

function parseIPv6(text: string): Uint8Array | null {
  let input = text;

  const zoneAt = input.indexOf('%');
  if (zoneAt !== -1) input = input.slice(0, zoneAt);

  // Rewrite a trailing dotted-quad (::ffff:1.2.3.4) into two hextets.
  const lastColon = input.lastIndexOf(':');
  if (lastColon === -1) return null;
  if (input.slice(lastColon + 1).includes('.')) {
    const v4 = parseIPv4(input.slice(lastColon + 1));
    if (!v4) return null;
    const high = ((v4[0] << 8) | v4[1]).toString(16);
    const low = ((v4[2] << 8) | v4[3]).toString(16);
    input = `${input.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = input.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (segment: string): number[] | null => {
    if (segment === '') return [];
    const groups: number[] = [];
    for (const group of segment.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      groups.push(parseInt(group, 16));
    }
    return groups;
  };

  const head = parseGroups(halves[0]);
  const tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (!head || !tail) return null;

  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    bytes[i * 2] = groups[i] >> 8;
    bytes[i * 2 + 1] = groups[i] & 0xff;
  }
  return bytes;
}

function inCidr(address: Uint8Array, cidr: readonly [string, number]): boolean {
  const network = address.length === 4 ? parseIPv4(cidr[0]) : parseIPv6(cidr[0]);
  if (!network || network.length !== address.length) return false;

  let bitsLeft = cidr[1];
  for (let i = 0; i < address.length && bitsLeft > 0; i++) {
    const take = Math.min(8, bitsLeft);
    const mask = take === 8 ? 0xff : (0xff << (8 - take)) & 0xff;
    if ((address[i] & mask) !== (network[i] & mask)) return false;
    bitsLeft -= take;
  }
  return true;
}

/**
 * True for any address that is not a public unicast destination. IPv4-mapped
 * IPv6 (::ffff:127.0.0.1) is unwrapped so it cannot be used to smuggle a
 * private IPv4 address past the v4 rules.
 */
export function isBlockedAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return BLOCKED_V4.some((cidr) => inCidr(v4, cidr));

  const v6 = parseIPv6(address);
  if (!v6) return true; // unparseable: fail closed

  const isV4Mapped =
    v6.subarray(0, 10).every((byte) => byte === 0) && v6[10] === 0xff && v6[11] === 0xff;
  if (isV4Mapped) {
    return BLOCKED_V4.some((cidr) => inCidr(v6.subarray(12), cidr));
  }

  return BLOCKED_V6.some((cidr) => inCidr(v6, cidr));
}

function sniffImageType(body: Buffer): string | null {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return 'image/jpeg';
  }
  if (body.length >= 6) {
    const magic = body.subarray(0, 6).toString('latin1');
    if (magic === 'GIF87a' || magic === 'GIF89a') return 'image/gif';
  }
  if (
    body.length >= 12 &&
    body.subarray(0, 4).toString('latin1') === 'RIFF' &&
    body.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (body.length >= 2 && body[0] === 0x42 && body[1] === 0x4d) return 'image/bmp';
  if (body.length >= 4 && body[0] === 0 && body[1] === 0 && body[2] === 1 && body[3] === 0) {
    return 'image/x-icon';
  }
  if (body.length >= 12 && body.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = body.subarray(8, 12).toString('latin1');
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }

  // SVG is text, and the known-icon list ships one, so it has to be allowed.
  const head = body.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!DOCTYPE svg')) {
    if (body.subarray(0, 4096).toString('utf8').includes('<svg')) return 'image/svg+xml';
  }

  return null;
}

interface HopResponse {
  status: number;
  contentType: string;
  location: string | null;
  body: Buffer;
}

/** Strip the brackets the WHATWG URL parser keeps around IPv6 literals. */
function bareHostname(url: URL): string {
  return url.hostname.replace(/^\[/, '').replace(/\]$/, '');
}

async function validateTarget(url: URL): Promise<{ address: string; family: 4 | 6 }> {
  if (url.protocol !== 'https:') {
    throw new SafeFetchError(`blocked scheme: ${url.protocol}`);
  }

  const host = bareHostname(url);
  if (host === '') {
    throw new SafeFetchError('blocked empty host');
  }

  // An IP literal needs no DNS, but still has to clear the range checks.
  if (parseIPv4(host) || host.includes(':')) {
    if (isBlockedAddress(host)) {
      throw new SafeFetchError(`blocked address: ${host}`);
    }
    return { address: host, family: parseIPv4(host) ? 4 : 6 };
  }

  let resolved: LookupAddress[];
  try {
    resolved = await dns.lookup(host, { all: true });
  } catch {
    throw new SafeFetchError(`unresolvable host: ${host}`);
  }
  if (resolved.length === 0) {
    throw new SafeFetchError(`unresolvable host: ${host}`);
  }

  // Reject if *any* record is private, so a mixed record set cannot be used to
  // win the race between our check and the socket's own resolution.
  for (const entry of resolved) {
    if (isBlockedAddress(entry.address)) {
      throw new SafeFetchError(`blocked address: ${host} -> ${entry.address}`);
    }
  }

  const chosen = resolved[0];
  return { address: chosen.address, family: chosen.family === 6 ? 6 : 4 };
}

function requestHop(
  url: URL,
  pinned: { address: string; family: 4 | 6 },
  timeoutMs: number,
  maxBytes: number
): Promise<HopResponse> {
  return new Promise<HopResponse>((resolve, reject) => {
    const host = bareHostname(url);

    // Hand the socket the one address we validated instead of letting it
    // resolve the name a second time.
    const lookup = ((_hostname: string, options: LookupOptions, callback: unknown): void => {
      if (options && options.all) {
        (callback as (e: Error | null, a: LookupAddress[]) => void)(null, [
          { address: pinned.address, family: pinned.family },
        ]);
      } else {
        (callback as (e: Error | null, a: string, f: number) => void)(
          null,
          pinned.address,
          pinned.family
        );
      }
    }) as unknown as net.LookupFunction;

    const request = https.request(
      {
        method: 'GET',
        hostname: host,
        port: url.port === '' ? 443 : Number(url.port),
        path: `${url.pathname}${url.search}`,
        servername: parseIPv4(host) || host.includes(':') ? undefined : host,
        headers: { accept: '*/*' },
        timeout: timeoutMs,
        lookup,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = (response.headers['content-type'] ?? '').split(';')[0].trim();
        const location = response.headers.location ?? null;

        const declared = Number(response.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) {
          response.destroy();
          request.destroy();
          reject(new SafeFetchError(`response too large: ${declared} bytes`));
          return;
        }

        // Nothing downstream reads a redirect body.
        if (REDIRECT_STATUSES.has(status) && location) {
          response.destroy();
          request.destroy();
          resolve({ status, contentType, location, body: Buffer.alloc(0) });
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;

        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            response.destroy();
            request.destroy();
            reject(new SafeFetchError(`response exceeded ${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          resolve({ status, contentType, location, body: Buffer.concat(chunks) });
        });
        response.on('error', (error) => reject(error));
      }
    );

    request.on('timeout', () => {
      request.destroy(new SafeFetchError(`request timed out after ${timeoutMs}ms`));
    });
    request.on('error', (error) => reject(error));
    request.end();
  });
}

export async function safeFetch(rawUrl: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const deadline = Date.now() + options.timeoutMs;

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new SafeFetchError('malformed url');
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new SafeFetchError('timed out before completing redirect chain');
    }

    const pinned = await validateTarget(current);
    const response = await requestHop(current, pinned, remaining, options.maxBytes);

    if (REDIRECT_STATUSES.has(response.status) && response.location) {
      let next: URL;
      try {
        next = new URL(response.location, current);
      } catch {
        throw new SafeFetchError('malformed redirect location');
      }
      current = next;
      continue;
    }

    const ok = response.status >= 200 && response.status < 300;

    if (options.requireImage) {
      if (!ok) {
        throw new SafeFetchError(`upstream returned ${response.status}`);
      }
      const sniffed = sniffImageType(response.body);
      if (!sniffed) {
        throw new SafeFetchError('response body is not a recognised image');
      }
      // Report the sniffed type, never the upstream header, so a response we
      // are about to inline cannot dictate its own content type.
      return { ok, status: response.status, contentType: sniffed, body: response.body };
    }

    return { ok, status: response.status, contentType: response.contentType, body: response.body };
  }

  throw new SafeFetchError(`exceeded ${maxRedirects} redirects`);
}
