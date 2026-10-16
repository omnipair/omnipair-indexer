import { SolanaJSONRPCErrorCode } from '@solana/web3.js';

const TRANSIENT_TRANSPORT_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE',
  'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
]);
const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_RPC_CODES = new Set<number>([
  SolanaJSONRPCErrorCode.JSON_RPC_SERVER_ERROR_NODE_UNHEALTHY,
  SolanaJSONRPCErrorCode.JSON_RPC_SERVER_ERROR_MIN_CONTEXT_SLOT_NOT_REACHED,
  -32603, // JSON-RPC internal server error
]);

/** Only known transport/server failures warrant automatic retry guidance. */
export function isRetryableRpcError(error: unknown, seen = new Set<unknown>()): boolean {
  if (!error || typeof error !== 'object' || seen.has(error)) return false;
  seen.add(error);
  const detail = error as {
    code?: unknown; name?: unknown; message?: unknown;
    status?: unknown; statusCode?: unknown; cause?: unknown;
  };

  if (typeof detail.code === 'string' && TRANSIENT_TRANSPORT_CODES.has(detail.code)) return true;
  if (typeof detail.code === 'number' && TRANSIENT_RPC_CODES.has(detail.code)) return true;
  if (detail.name === 'TimeoutError') return true;
  for (const status of [detail.status, detail.statusCode]) {
    if (typeof status === 'number') return TRANSIENT_HTTP_STATUSES.has(status);
  }

  // web3.js emits HTTP failures as Error("503 Service Unavailable: ...").
  const httpStatus = typeof detail.message === 'string'
    ? detail.message.match(/^(\d{3}) [^:\r\n]*:/)?.[1]
    : undefined;
  if (httpStatus) return TRANSIENT_HTTP_STATUSES.has(Number(httpStatus));

  // Native fetch wraps network errors in TypeError with a transport cause.
  return isRetryableRpcError(detail.cause, seen);
}
