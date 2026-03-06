/**
 * Tests for FastSet payment handler
 * 
 * Note: Full payment flow tests require valid Ed25519 keys and are
 * integration tests. These unit tests focus on configuration and exports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FASTSET_NETWORKS } from '../fastset.js';

describe('FastSet Payment Handler', () => {
  describe('FASTSET_NETWORKS', () => {
    it('should include expected networks', () => {
      assert.ok(Array.isArray(FASTSET_NETWORKS));
      assert.ok(FASTSET_NETWORKS.includes('fastset-devnet'));
      assert.ok(FASTSET_NETWORKS.includes('fastset-mainnet'));
      assert.ok(FASTSET_NETWORKS.includes('fast'));
    });

    it('should have at least 3 networks', () => {
      assert.ok(FASTSET_NETWORKS.length >= 3);
    });
  });

  // Note: Full payment flow tests (handleFastSetPayment) require:
  // - Valid Ed25519 key pairs
  // - Valid bech32m addresses that decode to 32-byte public keys
  // - Proper BCS serialization
  // These are better suited as integration tests with a test network.
});
