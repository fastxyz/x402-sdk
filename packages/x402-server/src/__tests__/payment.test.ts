/**
 * Tests for x402-server payment functions
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPaymentRequirement,
  createPaymentRequired,
  parsePaymentHeader,
  encodePaymentResponse,
} from '../payment.js';
import { initNetworkConfig } from '../utils.js';

const originalFetch = globalThis.fetch;

describe('x402-server payment', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    initNetworkConfig();
  });

  describe('createPaymentRequirement', () => {
    it('should create EVM payment requirement', () => {
      const req = createPaymentRequirement(
        '0x1234567890abcdef1234567890abcdef12345678',
        { price: '$0.10', network: 'arbitrum-sepolia' },
        '/api/data'
      );

      assert.strictEqual(req.scheme, 'exact');
      assert.strictEqual(req.network, 'arbitrum-sepolia');
      assert.strictEqual(req.maxAmountRequired, '100000');
      assert.strictEqual(req.payTo, '0x1234567890abcdef1234567890abcdef12345678');
      assert.strictEqual(req.resource, '/api/data');
      assert.strictEqual(req.maxTimeoutSeconds, 60);
      assert.ok(req.asset.startsWith('0x'));
      assert.ok(req.extra);
      assert.strictEqual(req.extra.name, 'USD Coin');
    });

    it('should create Fast payment requirement', () => {
      const req = createPaymentRequirement(
        'fast1abc123xyz',
        { price: '$0.01', network: 'fast-testnet' },
        '/api/fast-data'
      );

      assert.strictEqual(req.scheme, 'exact');
      assert.strictEqual(req.network, 'fast-testnet');
      assert.strictEqual(req.maxAmountRequired, '10000');
      assert.strictEqual(req.payTo, 'fast1abc123xyz');
      assert.strictEqual(req.extra, undefined);
    });

    it('should use custom description', () => {
      const req = createPaymentRequirement(
        '0x123',
        { 
          price: '$0.10', 
          network: 'arbitrum-sepolia',
          config: { description: 'Premium weather data' }
        },
        '/api/weather'
      );

      assert.strictEqual(req.description, 'Premium weather data');
    });

    it('should use custom asset address', () => {
      const customAsset = '0xcustomtoken123';
      const req = createPaymentRequirement(
        '0x123',
        { 
          price: '$0.10', 
          network: 'arbitrum-sepolia',
          config: { asset: customAsset }
        },
        '/api/data'
      );

      assert.strictEqual(req.asset, customAsset);
    });

    it('should include client-required metadata for custom EVM networks', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'x402-server-payment-'));
      const configPath = join(tempDir, 'networks.json');

      writeFileSync(configPath, JSON.stringify({
        'my-custom-network': {
          asset: '0x1234567890abcdef1234567890abcdef12345678',
          decimals: 6,
          extra: {
            name: 'My USDC',
            version: '1',
            chainId: 84532,
            rpcUrl: 'https://base-sepolia.example/rpc',
          },
        },
      }));

      try {
        initNetworkConfig(configPath);

        const req = createPaymentRequirement(
          '0x1234567890abcdef1234567890abcdef12345678',
          { price: '$0.10', network: 'my-custom-network' },
          '/api/custom'
        );

        assert.deepStrictEqual(req.extra, {
          name: 'My USDC',
          version: '1',
          chainId: 84532,
          rpcUrl: 'https://base-sepolia.example/rpc',
        });
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should reject custom EVM networks without chain metadata', () => {
      const tempDir = mkdtempSync(join(tmpdir(), 'x402-server-payment-'));
      const configPath = join(tempDir, 'networks.json');

      writeFileSync(configPath, JSON.stringify({
        'my-custom-network': {
          asset: '0x1234567890abcdef1234567890abcdef12345678',
          decimals: 6,
        },
      }));

      try {
        initNetworkConfig(configPath);

        assert.throws(
          () => createPaymentRequirement(
            '0x1234567890abcdef1234567890abcdef12345678',
            { price: '$0.10', network: 'my-custom-network' },
            '/api/custom'
          ),
          /requires config\.extra\.chainId and config\.extra\.rpcUrl/
        );
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('createPaymentRequired', () => {
    it('should create 402 response body', () => {
      const response = createPaymentRequired(
        '0x123',
        { price: '$0.10', network: 'arbitrum-sepolia' },
        '/api/data'
      );

      assert.strictEqual(response.error, 'X-PAYMENT header is required');
      assert.ok(Array.isArray(response.accepts));
      assert.strictEqual(response.accepts.length, 1);
      assert.strictEqual(response.accepts[0].network, 'arbitrum-sepolia');
    });
  });

  describe('parsePaymentHeader', () => {
    it('should decode base64 payment header', () => {
      const payload = {
        x402Version: 1,
        scheme: 'exact',
        network: 'arbitrum-sepolia',
        payload: { signature: '0x123' },
      };
      
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
      const decoded = parsePaymentHeader(encoded);

      assert.deepStrictEqual(decoded, payload);
    });
  });

  describe('encodePaymentResponse', () => {
    it('should encode response to base64', () => {
      const response = {
        success: true,
        txHash: '0xabc123',
        network: 'arbitrum-sepolia',
        payer: '0x456',
      };

      const encoded = encodePaymentResponse(response);
      assert.ok(typeof encoded === 'string');

      // Verify it can be decoded
      const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString());
      assert.deepStrictEqual(decoded, response);
    });
  });
});
