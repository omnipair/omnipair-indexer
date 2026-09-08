import test from 'node:test';
import assert from 'node:assert/strict';
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
