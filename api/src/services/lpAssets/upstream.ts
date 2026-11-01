import { Connection, PublicKey } from '@solana/web3.js';
import { getTokenMetadata, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { getMetadataAccountDataSerializer, Key } from '@metaplex-foundation/mpl-token-metadata';
import { safeFetch } from '../../utils/safeFetch';
import { resolveIpfsUrl } from '../../utils/ipfs';
import { boundedText, PermanentLpError, TokenIdentity } from './model';

// Full getGenesisHash result (CAIP-2 truncates this and must not be used here).
const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const METADATA_PROGRAM = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/** Bounded trusted-service response; the caller owns an AbortSignal deadline. */
export async function readBoundedResponse(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) throw new Error('Empty upstream response');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error('Upstream response too large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel(); }
}

export function mainnetConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, {
    commitment: 'confirmed', disableRetryOnRateLimit: true,
    fetch: async (url, init) => {
      const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10_000) });
      const body = await readBoundedResponse(response, 1024 * 1024);
      return new Response(new Uint8Array(body), { status: response.status, headers: { 'content-type': 'application/json' } });
    },
  });
}

export async function verifyMainnet(connection: Connection): Promise<void> {
  if (await connection.getGenesisHash() !== MAINNET_GENESIS) throw new Error('LP assets require Solana mainnet');
}

export class LpTokenResolver {
  constructor(private readonly connection: Connection) {}

  async resolve(address: string): Promise<TokenIdentity> {
    const mint = new PublicKey(address);
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from('metadata'), METADATA_PROGRAM.toBuffer(), mint.toBuffer()], METADATA_PROGRAM);
    const [info, metadataInfo] = await this.connection.getMultipleAccountsInfo([mint, pda]);
    if (!info || info.executable || (!info.owner.equals(TOKEN_PROGRAM_ID) && !info.owner.equals(TOKEN_2022_PROGRAM_ID))) {
      throw new PermanentLpError('Invalid mint account');
    }
    try {
      if (!unpackMint(mint, info, info.owner).isInitialized) throw new Error('Uninitialized mint');
    } catch { throw new PermanentLpError('Invalid mint data'); }

    let identity: { name: string; symbol: string; uri: string } | null = null;
    if (metadataInfo && metadataInfo.owner.equals(METADATA_PROGRAM)) {
      try {
        const [metadata] = getMetadataAccountDataSerializer().deserialize(metadataInfo.data);
        if (metadata.key === Key.MetadataV1 && metadata.mint === address) identity = metadata;
      } catch { /* Malformed optional metadata uses the same bounded fallback as absent metadata. */ }
    }
    if (!identity && info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      identity = await getTokenMetadata(this.connection, mint);
    }
    const symbol = boundedText(identity?.symbol, 'Unknown', 32);
    const name = boundedText(identity?.name, symbol, 96);
    let iconUrl: string | undefined;
    const uri = identity?.uri.replace(/\0/g, '').trim();
    if (uri && uri.length <= 2048) {
      try {
        const response = await safeFetch(resolveIpfsUrl(uri), { timeoutMs: 10_000, maxBytes: 256 * 1024 });
        if (response.ok) {
          const json = JSON.parse(response.body.toString('utf8'));
          if (typeof json?.image === 'string' && json.image.length <= 2048) iconUrl = json.image;
        }
      } catch { /* Logo failures get deterministic initials, never arbitrary upload bytes. */ }
    }
    return { symbol, name, iconUrl };
  }
}
