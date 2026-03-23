/**
 * Tests for Fast RPC endpoint resolution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FAST_RPC_URLS, resolveFastRpcUrl } from '../fast-rpc.js';

describe('Fast RPC resolution', () => {
  it('resolves testnet and mainnet to the official Fast proxies', () => {
    assert.strictEqual(
      FAST_RPC_URLS['fast-testnet'],
      'https://testnet.api.fast.xyz/proxy'
    );
    assert.strictEqual(
      FAST_RPC_URLS['fast-mainnet'],
      'https://api.fast.xyz/proxy'
    );
  });

  it('uses the network-specific default when no override is provided', () => {
    assert.strictEqual(
      resolveFastRpcUrl('fast-testnet'),
      'https://testnet.api.fast.xyz/proxy'
    );
    assert.strictEqual(
      resolveFastRpcUrl('fast-mainnet'),
      'https://api.fast.xyz/proxy'
    );
  });

  it('falls back to testnet for unknown networks', () => {
    assert.strictEqual(
      resolveFastRpcUrl('unknown-fast-network'),
      'https://testnet.api.fast.xyz/proxy'
    );
  });

  it('prefers an explicit rpc override', () => {
    assert.strictEqual(
      resolveFastRpcUrl('fast-mainnet', 'https://custom.fast.example/proxy'),
      'https://custom.fast.example/proxy'
    );
  });
});
