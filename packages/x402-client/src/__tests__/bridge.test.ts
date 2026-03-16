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
  getFastBalance,
} from '../bridge.js';
import { mockFastWalletData } from './helpers.js';

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
    it('should use mainnet token resolution when requested', async () => {
      const fastUsdcTokenId = Array.from(
        Buffer.from('b4cf1b9e227bb6a21b959338895dfb39b8d2a96dfa1ce5dd633561c193124cb5', 'hex')
      );
      const rpcCalls: Array<{ url: string; method?: string }> = [];

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const body = init?.body ? JSON.parse(init.body as string) as { method?: string } : {};
        rpcCalls.push({ url, method: body.method });

        if (body.method === 'proxy_getAccountInfo') {
          return new Response(JSON.stringify({
            result: {
              token_balance: [[fastUsdcTokenId, 'f4240']],
            },
          }), { status: 200 });
        }

        if (body.method === 'proxy_getTokenInfo') {
          return new Response(JSON.stringify({
            result: {
              requested_token_metadata: [[fastUsdcTokenId, { decimals: 6 }]],
            },
          }), { status: 200 });
        }

        throw new Error(`Unexpected RPC method: ${body.method}`);
      };

      const balance = await getFastBalance(
        { address: mockFastWalletData.address } as unknown as import('@fastxyz/sdk').FastWallet,
        'mainnet'
      );

      assert.strictEqual(balance, 1_000_000n);
      assert.strictEqual(rpcCalls[0]?.url, 'https://api.fast.xyz/proxy');
    });
  });

  // Note: Full bridge flow tests (bridgeFastusdcToUsdc, getFastBalance) require:
  // - Valid Ed25519 key pairs
  // - Valid bech32m addresses
  // - Proper BCS serialization
  // These are better suited as integration tests with a test network.
});
