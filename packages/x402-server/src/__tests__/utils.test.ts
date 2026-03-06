/**
 * Tests for x402-server utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  parsePrice,
  getNetworkConfig,
  encodePayload,
  decodePayload,
  NETWORK_CONFIGS,
} from '../utils.js';

describe('x402-server utils', () => {
  describe('NETWORK_CONFIGS', () => {
    it('should include Fast networks', () => {
      assert.ok(NETWORK_CONFIGS['fast-testnet']);
      assert.ok(NETWORK_CONFIGS['fast-mainnet']);
    });

    it('should include EVM networks', () => {
      assert.ok(NETWORK_CONFIGS['arbitrum-sepolia']);
      assert.ok(NETWORK_CONFIGS['arbitrum']);
      assert.ok(NETWORK_CONFIGS['base-sepolia']);
      assert.ok(NETWORK_CONFIGS['base']);
    });

    it('should have correct decimals for USDC', () => {
      assert.strictEqual(NETWORK_CONFIGS['arbitrum-sepolia'].decimals, 6);
      assert.strictEqual(NETWORK_CONFIGS['fast-testnet'].decimals, 6);
    });

    it('should include EIP-712 extra for EVM networks', () => {
      const config = NETWORK_CONFIGS['arbitrum-sepolia'];
      assert.ok(config.extra);
      assert.strictEqual(config.extra.name, 'USD Coin');
      assert.strictEqual(config.extra.version, '2');
    });

    it('should not include extra for Fast networks', () => {
      const config = NETWORK_CONFIGS['fast-testnet'];
      assert.strictEqual(config.extra, undefined);
    });
  });

  describe('parsePrice', () => {
    it('should parse dollar format', () => {
      assert.strictEqual(parsePrice('$0.10'), '100000');
      assert.strictEqual(parsePrice('$1.00'), '1000000');
      assert.strictEqual(parsePrice('$0.01'), '10000');
    });

    it('should parse decimal format', () => {
      assert.strictEqual(parsePrice('0.10'), '100000');
      assert.strictEqual(parsePrice('1.5'), '1500000');
    });

    it('should parse USDC suffix', () => {
      assert.strictEqual(parsePrice('0.10 USDC'), '100000');
      assert.strictEqual(parsePrice('0.10USDC'), '100000');
      assert.strictEqual(parsePrice('0.10 usdc'), '100000');
    });

    it('should parse raw integer amounts', () => {
      assert.strictEqual(parsePrice('100000'), '100000');
      assert.strictEqual(parsePrice('1000000'), '1000000');
    });

    it('should handle custom decimals', () => {
      assert.strictEqual(parsePrice('1.0', 18), '1000000000000000000');
      assert.strictEqual(parsePrice('0.5', 8), '50000000');
    });

    it('should throw for invalid format', () => {
      assert.throws(() => parsePrice('invalid'), /Invalid price format/);
      assert.throws(() => parsePrice('abc'), /Invalid price format/);
    });
  });

  describe('getNetworkConfig', () => {
    it('should return config for known networks', () => {
      const config = getNetworkConfig('arbitrum-sepolia');
      assert.ok(config);
      assert.strictEqual(config.decimals, 6);
      assert.ok(config.asset.startsWith('0x'));
    });

    it('should return default config for unknown networks', () => {
      const config = getNetworkConfig('unknown-network');
      assert.ok(config);
      assert.strictEqual(config.decimals, 6);
    });
  });

  describe('encodePayload / decodePayload', () => {
    it('should encode and decode JSON payload', () => {
      const payload = { success: true, txHash: '0x123' };
      const encoded = encodePayload(payload);
      
      assert.ok(typeof encoded === 'string');
      assert.ok(encoded.length > 0);
      
      const decoded = decodePayload(encoded);
      assert.deepStrictEqual(decoded, payload);
    });

    it('should handle complex objects', () => {
      const payload = {
        nested: { deep: { value: [1, 2, 3] } },
        unicode: '日本語',
      };
      
      const encoded = encodePayload(payload);
      const decoded = decodePayload(encoded);
      assert.deepStrictEqual(decoded, payload);
    });
  });
});
