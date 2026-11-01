import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { isBlockedAddress, safeFetch, SafeFetchError } from '../utils/safeFetch';

test('isBlockedAddress rejects loopback, private and link-local IPv4', () => {
  for (const address of [
    '127.0.0.1',
    '127.1.2.3',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // carrier-grade NAT
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
  ]) {
    assert.equal(isBlockedAddress(address), true, `expected ${address} to be blocked`);
  }
});

test('isBlockedAddress allows public IPv4', () => {
  for (const address of ['1.1.1.1', '8.8.8.8', '104.18.32.7', '172.32.0.1', '100.63.255.255']) {
    assert.equal(isBlockedAddress(address), false, `expected ${address} to be allowed`);
  }
});

test('isBlockedAddress rejects loopback, ULA and link-local IPv6', () => {
  for (const address of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1']) {
    assert.equal(isBlockedAddress(address), true, `expected ${address} to be blocked`);
  }
});

test('isBlockedAddress unwraps IPv4-mapped IPv6 rather than trusting the v6 rules', () => {
  assert.equal(isBlockedAddress('::ffff:127.0.0.1'), true);
  assert.equal(isBlockedAddress('::ffff:169.254.169.254'), true);
  assert.equal(isBlockedAddress('::ffff:7f00:1'), true);
  assert.equal(isBlockedAddress('::ffff:1.1.1.1'), false);
});

test('isBlockedAddress fails closed on unparseable input', () => {
  for (const address of ['', 'not-an-ip', '1.2.3', '1.2.3.4.5', '999.1.1.1', 'fg::1']) {
    assert.equal(isBlockedAddress(address), true, `expected ${address} to be blocked`);
  }
});

test('isBlockedAddress allows public IPv6', () => {
  assert.equal(isBlockedAddress('2606:4700::1111'), false);
});

test('safeFetch rejects IPv6 translation and non-global ranges', () => {
  for (const address of ['2002:7f00:1::', '2001::1', '64:ff9b:1::1', '::127.0.0.1', '3fff::1']) {
    assert.equal(isBlockedAddress(address), true);
  }
});

test('safeFetch includes DNS resolution in its overall deadline', async (t) => {
  t.mock.method(dns, 'lookup', () => new Promise(() => {}));
  await assert.rejects(safeFetch('https://example.com/', { timeoutMs: 20, maxBytes: 1024 }), /deadline/);
});

test('safeFetch rejects mixed public/private DNS and URL credentials', async (t) => {
  t.mock.method(dns, 'lookup', async () => [{ address: '1.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }]);
  await assert.rejects(safeFetch('https://example.com/', { timeoutMs: 100, maxBytes: 1024 }), /blocked address/);
  await assert.rejects(safeFetch('https://user:pass@example.com/', { timeoutMs: 100, maxBytes: 1024 }), /credentials/);
});

test('safeFetch validates redirects and pins the socket to the checked DNS address', async (t) => {
  t.mock.method(dns, 'lookup', async () => [{ address: '1.1.1.1', family: 4 }]);
  let calls = 0;
  t.mock.method(https, 'request', (options: any, callback: (value: any) => void) => {
    calls++;
    options.lookup('example.com', {}, (_error: Error | null, address: string) => assert.equal(address, '1.1.1.1'));
    const req = new EventEmitter() as any;
    req.destroy = (error?: Error) => { if (error) req.emit('error', error); req.emit('close'); };
    req.end = () => queueMicrotask(() => {
      const response = new PassThrough() as any;
      response.statusCode = 302;
      response.headers = { location: 'https://169.254.169.254/private' };
      callback(response);
    });
    return req;
  });
  await assert.rejects(safeFetch('https://example.com/', { timeoutMs: 100, maxBytes: 1024 }), /blocked address/);
  assert.equal(calls, 1);
});

test('safeFetch aborts slow-drip bodies at the absolute deadline', async (t) => {
  t.mock.method(dns, 'lookup', async () => [{ address: '1.1.1.1', family: 4 }]);
  t.mock.method(https, 'request', (_options: any, callback: (value: any) => void) => {
    const req = new EventEmitter() as any;
    const response = new PassThrough() as any;
    response.statusCode = 200; response.headers = {};
    let drip: NodeJS.Timeout;
    req.destroy = (error?: Error) => {
      clearInterval(drip); response.destroy();
      if (error) req.emit('error', error);
      req.emit('close');
    };
    req.end = () => queueMicrotask(() => { callback(response); drip = setInterval(() => response.write('a'), 2); });
    return req;
  });
  await assert.rejects(safeFetch('https://example.com/', { timeoutMs: 30, maxBytes: 1024 }), /deadline/);
});

test('safeFetch rejects non-https schemes', async () => {
  await assert.rejects(
    safeFetch('http://169.254.169.254/latest/meta-data/', { timeoutMs: 1000, maxBytes: 1024 }),
    (error: Error) => error instanceof SafeFetchError && /blocked scheme/.test(error.message)
  );
  await assert.rejects(
    safeFetch('file:///etc/passwd', { timeoutMs: 1000, maxBytes: 1024 }),
    (error: Error) => error instanceof SafeFetchError && /blocked scheme/.test(error.message)
  );
  await assert.rejects(
    safeFetch('gopher://127.0.0.1:6379/', { timeoutMs: 1000, maxBytes: 1024 }),
    (error: Error) => error instanceof SafeFetchError && /blocked scheme/.test(error.message)
  );
});

test('safeFetch rejects private hosts given as literals', async () => {
  for (const url of [
    'https://127.0.0.1/',
    'https://169.254.169.254/latest/meta-data/',
    'https://10.1.2.3/internal',
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
  ]) {
    await assert.rejects(
      safeFetch(url, { timeoutMs: 1000, maxBytes: 1024 }),
      (error: Error) => error instanceof SafeFetchError && /blocked address/.test(error.message),
      `expected ${url} to be blocked`
    );
  }
});

test('safeFetch rejects malformed urls', async () => {
  await assert.rejects(
    safeFetch('not a url', { timeoutMs: 1000, maxBytes: 1024 }),
    (error: Error) => error instanceof SafeFetchError && /malformed url/.test(error.message)
  );
});
