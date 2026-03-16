/**
 * Tests for AllSet bridge functionality
 * 
 * Note: Full bridge flow tests require valid Ed25519 keys and are
 * integration tests. These unit tests focus on configuration and utilities.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  getBridgeConfig,
  getFastBalance,
} from '../bridge.js';
import { mockFastWalletData } from './helpers.js';

describe('AllSet Bridge', () => {
  describe('getBridgeConfig', () => {
    it('should return config for arbitrum-sepolia', () => {
      const config = getBridgeConfig('arbitrum-sepolia');
      assert.ok(config);
      assert.strictEqual(config.chainId, 421614);
      assert.ok(config.usdcAddress.startsWith('0x'));
      assert.ok(config.fastBridgeAddress.startsWith('fast'));
      assert.ok(config.relayerUrl.includes('arbitrum'));
    });

    it('should return config for ethereum-sepolia', () => {
      const config = getBridgeConfig('ethereum-sepolia');
      assert.ok(config);
      assert.strictEqual(config.chainId, 11155111);
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

    it('should not fall back to testnet config for mainnet networks', () => {
      const config = getBridgeConfig('arbitrum');
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

  describe('getFastBalance', () => {
    it('should use the wallet provider for mainnet balance checks', async () => {
      let requestedAddress = '';
      let requestedToken = '';

      const wallet = {
        address: mockFastWalletData.address,
        provider: {
          getBalance: async (address: string, token?: string) => {
            requestedAddress = address;
            requestedToken = token ?? '';
            return {
              amount: '1',
              token: token ?? 'FAST',
            };
          },
        },
      } as unknown as import('@fastxyz/sdk').FastWallet;

      const balance = await getFastBalance(
        wallet,
        'mainnet'
      );

      assert.strictEqual(balance, 1_000_000n);
      assert.strictEqual(requestedAddress, mockFastWalletData.address);
      assert.strictEqual(requestedToken, 'fastUSDC');
    });
  });

  // Note: Full bridge flow tests (bridgeFastusdcToUsdc, getFastBalance) require:
  // - Valid Ed25519 key pairs
  // - Valid bech32m addresses
  // - Proper BCS serialization
  // These are better suited as integration tests with a test network.
});
