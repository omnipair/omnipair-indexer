export const TOKEN_LOGO_CACHE_CONTROL = 'public, max-age=86400';
export const TOKEN_LOGO_REFRESH_MS = 24 * 60 * 60 * 1000;
export const TOKEN_LOGO_SCAN_MS = 5 * 60 * 1000;
export const TOKEN_LOGO_MAX_BYTES = 512 * 1024;

export interface TokenLogoConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  apiOrigin: string;
}

export function readTokenLogoConfig(env: NodeJS.ProcessEnv = process.env): TokenLogoConfig | null {
  if (env.TOKEN_LOGO_CACHE_ENABLED !== 'true') return null;

  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Token logo cache requires ${name}`);
    return value;
  };
  const endpoint = new URL(required('TOKEN_LOGO_S3_ENDPOINT'));
  const apiUrl = new URL(required('TOKEN_LOGO_API_ORIGIN'));
  for (const url of [endpoint, apiUrl]) {
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Token logo endpoint and API origin must be HTTPS URLs without credentials, query, or fragment');
    }
  }
  if (apiUrl.pathname !== '/') throw new Error('TOKEN_LOGO_API_ORIGIN must contain only the API origin');

  return {
    endpoint: endpoint.toString(),
    bucket: required('TOKEN_LOGO_S3_BUCKET'),
    region: env.TOKEN_LOGO_S3_REGION?.trim() || 'auto',
    accessKeyId: required('TOKEN_LOGO_S3_ACCESS_KEY_ID'),
    secretAccessKey: required('TOKEN_LOGO_S3_SECRET_ACCESS_KEY'),
    apiOrigin: apiUrl.origin,
  };
}
