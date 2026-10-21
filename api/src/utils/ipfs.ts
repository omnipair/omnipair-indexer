/** Resolve IPFS URIs through a server-compatible HTTPS gateway. */
export function resolveIpfsUrl(source: string): string {
  const value = source.trim();
  if (!value.startsWith('ipfs://')) return value;
  const gateway = process.env.TOKEN_LOGO_IPFS_GATEWAY?.trim() || 'https://gateway.pinata.cloud/ipfs/';
  const url = new URL(gateway);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('TOKEN_LOGO_IPFS_GATEWAY must be an HTTPS URL without credentials, query, or fragment');
  }
  const path = value.slice('ipfs://'.length).replace(/^ipfs\//, '');
  if (!path) throw new Error('IPFS URI is missing a content identifier');
  return `${url.toString().replace(/\/+$/, '')}/${path}`;
}
