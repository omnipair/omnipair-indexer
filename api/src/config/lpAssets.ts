export interface LpAssetConfig { rpcUrl: string; pinataJwt: string; gatewayOrigin: string; concurrency: number }

export function readLpAssetConfig(env: NodeJS.ProcessEnv = process.env): LpAssetConfig | null {
  if (env.LP_ASSETS_ENABLED !== 'true') return null;
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`LP assets require ${key}`);
    return value;
  };
  const rpc = new URL(required('LP_ASSETS_MAINNET_RPC_URL'));
  const gateway = new URL(required('LP_ASSETS_GATEWAY_ORIGIN'));
  if (rpc.protocol !== 'https:' || rpc.username || rpc.password || rpc.hash) {
    throw new Error('LP_ASSETS_MAINNET_RPC_URL must be HTTPS without userinfo or fragment');
  }
  if (gateway.protocol !== 'https:' || gateway.username || gateway.password || gateway.search
    || gateway.hash || gateway.pathname !== '/' || gateway.origin.length > 51) {
    throw new Error('LP_ASSETS_GATEWAY_ORIGIN must be an HTTPS origin of at most 51 characters');
  }
  const concurrency = Number(env.LP_ASSETS_WORKER_CONCURRENCY || '2');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('LP_ASSETS_WORKER_CONCURRENCY must be an integer from 1 to 4');
  }
  return { rpcUrl: rpc.toString(), gatewayOrigin: gateway.origin, pinataJwt: required('LP_ASSETS_PINATA_JWT'), concurrency };
}
