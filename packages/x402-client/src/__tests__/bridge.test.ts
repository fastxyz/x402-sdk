/**
 * Tests for AllSet bridge functionality
 * 
 * Note: Full bridge flow tests require valid Ed25519 keys and are
 * integration tests. These unit tests focus on configuration and utilities.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  getBridgeConfig,
} from '../bridge.js';

const originalFetch = globalThis.fetch;

describe('AllSet Bridge', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getBridgeConfig', () => {
    it('should return config for arbitrum-sepolia', () => {
      const config = getBridgeConfig('arbitrum-sepolia');
      assert.ok(config);
      assert.strictEqual(config.chainId, 421614);
      assert.ok(config.usdcAddress.startsWith('0x'));
      assert.ok(config.fastBridgeAddress.startsWith('fast'));
      assert.ok(config.relayerUrl.includes('arbitrum'));
    });

    it('should return config for base-sepolia', () => {
      const config = getBridgeConfig('base-sepolia');
      assert.ok(config);
      assert.strictEqual(config.chainId, 84532);
      assert.ok(config.usdcAddress.startsWith('0x'));
    });

    it('should return null for unsupported network', () => {
      const config = getBridgeConfig('ethereum-mainnet');
      assert.strictEqual(config, null);
    });

    it('should return null for invalid network', () => {
      const config = getBridgeConfig('invalid-network');
      assert.strictEqual(config, null);
    });

    it('should have all required fields in config', () => {
      const config = getBridgeConfig('arbitrum-sepolia');
      assert.ok(config);
      assert.ok(typeof config.chainId === 'number');
      assert.ok(typeof config.usdcAddress === 'string');
      assert.ok(typeof config.fastBridgeAddress === 'string');
      assert.ok(typeof config.relayerUrl === 'string');
    });
  });

  // Note: Full bridge flow tests (bridgeSetusdcToUsdc, getFastBalance) require:
  // - Valid Ed25519 key pairs
  // - Valid bech32m addresses
  // - Proper BCS serialization
  // These are better suited as integration tests with a test network.
});
