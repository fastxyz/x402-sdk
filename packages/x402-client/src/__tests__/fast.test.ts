/**
 * Tests for Fast payment handler
 * 
 * Note: Full payment flow tests require valid Ed25519 keys and are
 * integration tests. These unit tests focus on configuration and exports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FAST_NETWORKS } from '../fast.js';

describe('Fast Payment Handler', () => {
  describe('FAST_NETWORKS', () => {
    it('should include expected networks', () => {
      assert.ok(Array.isArray(FAST_NETWORKS));
      assert.ok(FAST_NETWORKS.includes('fast-testnet'));
      assert.ok(FAST_NETWORKS.includes('fast-mainnet'));
    });

    it('should only expose explicit Fast networks', () => {
      assert.deepStrictEqual(FAST_NETWORKS, ['fast-testnet', 'fast-mainnet']);
    });
  });

  // Note: Full payment flow tests (handleFastPayment) require:
  // - Valid Ed25519 key pairs
  // - Valid bech32m addresses that decode to 32-byte public keys
  // - Proper BCS serialization
  // These are better suited as integration tests with a test network.
});
