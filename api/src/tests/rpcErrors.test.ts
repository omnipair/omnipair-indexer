import test from 'node:test';
import assert from 'node:assert/strict';
import { SolanaJSONRPCError } from '@solana/web3.js';
import { isRetryableRpcError } from '../utils/rpcErrors';

test('recognizes temporary SDK HTTP, RPC and transport failures', () => {
  const networkCause = Object.assign(new Error('connect timed out'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
  for (const error of [
    new Error('429 Too Many Requests: quota temporarily exceeded'),
    new Error('503 Service Unavailable: upstream unavailable'),
    { status: 502 }, { statusCode: 504 },
    Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
    Object.assign(new TypeError('fetch failed'), { cause: networkCause }),
    Object.assign(new Error('request timed out'), { name: 'TimeoutError' }),
    new SolanaJSONRPCError({ code: -32005, message: 'Node is unhealthy' }),
    new SolanaJSONRPCError({ code: -32016, message: 'Minimum context slot has not been reached' }),
    new SolanaJSONRPCError({ code: -32603, message: 'Internal error' }),
  ]) assert.equal(isRetryableRpcError(error), true, String(error));
});

test('does not advertise retries for configuration, account, decoding or unknown failures', () => {
  for (const error of [
    new Error('Pool state unavailable'),
    new Error('Invalid account discriminator'),
    new Error('Omnipair IDL not found'),
    new Error('Invalid LP balance or pool state'),
    new Error('401 Unauthorized: invalid RPC key'),
    new Error('403 Forbidden: access denied'),
    new Error('501 Not Implemented: unsupported method'),
    { status: 400 }, { statusCode: 404 },
    new SolanaJSONRPCError({ code: -32602, message: 'Invalid params' }),
    new SolanaJSONRPCError({ code: -32010, message: 'Key excluded from account secondary indexes' }),
    Object.assign(new TypeError('fetch failed'), { cause: { code: 'ERR_INVALID_URL' } }),
    new Error('Unknown failure'), undefined,
  ]) assert.equal(isRetryableRpcError(error), false, String(error));
});

test('cyclic error causes do not break the error response', () => {
  const error: { cause?: unknown } = {};
  error.cause = error;
  assert.equal(isRetryableRpcError(error), false);
});
