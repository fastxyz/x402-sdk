/**
 * Tests for x402-client main functions
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { 
  x402Pay, 
  parse402Response, 
  buildPaymentHeader, 
  parsePaymentHeader,
  FAST_NETWORKS,
  EVM_NETWORKS,
} from '../index.js';
import { mockEvmWallet, mockFastWallet, mock402Response, createMockFetch } from './helpers.js';

// Store original fetch
const originalFetch = globalThis.fetch;

describe('x402-client', () => {
  afterEach(() => {
    // Restore original fetch after each test
    globalThis.fetch = originalFetch;
  });

  describe('constants', () => {
    it('should export FAST_NETWORKS', () => {
      assert.ok(Array.isArray(FAST_NETWORKS));
      assert.ok(FAST_NETWORKS.includes('fast-devnet'));
      assert.ok(FAST_NETWORKS.includes('fast-mainnet'));
    });

    it('should export EVM_NETWORKS', () => {
      assert.ok(Array.isArray(EVM_NETWORKS));
      assert.ok(EVM_NETWORKS.includes('arbitrum-sepolia'));
      assert.ok(EVM_NETWORKS.includes('base-sepolia'));
    });
  });

  describe('buildPaymentHeader / parsePaymentHeader', () => {
    it('should encode and decode payment payload', () => {
      const payload = {
        x402Version: 1,
        scheme: 'exact',
        network: 'arbitrum-sepolia',
        payload: { signature: '0x123', authorization: { from: '0xabc' } },
      };

      const encoded = buildPaymentHeader(payload);
      assert.ok(typeof encoded === 'string');
      assert.ok(encoded.length > 0);

      const decoded = parsePaymentHeader(encoded);
      assert.deepStrictEqual(decoded, payload);
    });

    it('should handle complex nested objects', () => {
      const payload = {
        nested: { deep: { value: [1, 2, 3] } },
        unicode: '日本語',
      };

      const encoded = buildPaymentHeader(payload);
      const decoded = parsePaymentHeader(encoded);
      assert.deepStrictEqual(decoded, payload);
    });
  });

  describe('parse402Response', () => {
    it('should parse a 402 response', async () => {
      const mockResponse = new Response(JSON.stringify(mock402Response('arbitrum-sepolia')), {
        status: 402,
      });

      const result = await parse402Response(mockResponse);
      assert.strictEqual(result.x402Version, 1);
      assert.ok(Array.isArray(result.accepts));
      assert.strictEqual(result.accepts![0].network, 'arbitrum-sepolia');
    });

    it('should throw for non-402 response', async () => {
      const mockResponse = new Response('OK', { status: 200 });

      await assert.rejects(
        () => parse402Response(mockResponse),
        /Expected 402 response/
      );
    });
  });

  describe('x402Pay', () => {
    it('should return success for non-402 response', async () => {
      globalThis.fetch = createMockFetch([
        { status: 200, body: { data: 'free content' } },
      ]);

      const result = await x402Pay({
        url: 'https://api.example.com/free',
        wallet: mockEvmWallet,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.statusCode, 200);
      assert.deepStrictEqual(result.body, { data: 'free content' });
      assert.strictEqual(result.payment, undefined);
      assert.ok(result.note?.includes('without payment'));
    });

    it('should throw if no payment requirements in 402', async () => {
      globalThis.fetch = createMockFetch([
        { status: 402, body: { error: 'Payment required', accepts: [] } },
      ]);

      await assert.rejects(
        () => x402Pay({
          url: 'https://api.example.com/paid',
          wallet: mockEvmWallet,
        }),
        /No payment requirements/
      );
    });

    it('should throw if no matching wallet for network', async () => {
      globalThis.fetch = createMockFetch([
        { status: 402, body: mock402Response('arbitrum-sepolia') },
      ]);

      await assert.rejects(
        () => x402Pay({
          url: 'https://api.example.com/paid',
          wallet: mockFastWallet, // Only Fast wallet, but server wants EVM
        }),
        /No matching wallet/
      );
    });

    it('should accept array of wallets', async () => {
      // This test just verifies the function accepts wallet arrays
      // Full payment flow tested in evm.test.ts and fast.test.ts
      globalThis.fetch = createMockFetch([
        { status: 200, body: { data: 'content' } },
      ]);

      const result = await x402Pay({
        url: 'https://api.example.com/data',
        wallet: [mockEvmWallet, mockFastWallet],
      });

      assert.strictEqual(result.success, true);
    });

    it('should include logs when verbose=true', async () => {
      globalThis.fetch = createMockFetch([
        { status: 200, body: { data: 'content' } },
      ]);

      const result = await x402Pay({
        url: 'https://api.example.com/data',
        wallet: mockEvmWallet,
        verbose: true,
      });

      assert.ok(Array.isArray(result.logs));
      assert.ok(result.logs!.length > 0);
      assert.ok(result.logs!.some(log => log.includes('x402Pay START')));
    });

    it('should not include logs when verbose=false', async () => {
      globalThis.fetch = createMockFetch([
        { status: 200, body: { data: 'content' } },
      ]);

      const result = await x402Pay({
        url: 'https://api.example.com/data',
        wallet: mockEvmWallet,
        verbose: false,
      });

      assert.strictEqual(result.logs, undefined);
    });

    it('should pass custom headers', async () => {
      let customHeaderValue: string | undefined;
      let authHeaderValue: string | undefined;
      
      globalThis.fetch = async (input, init) => {
        const headers = init?.headers as Record<string, string> | undefined;
        customHeaderValue = headers?.['X-Custom'];
        authHeaderValue = headers?.['Authorization'];
        return new Response(JSON.stringify({ data: 'ok' }), { status: 200 });
      };

      await x402Pay({
        url: 'https://api.example.com/data',
        wallet: mockEvmWallet,
        headers: { 'X-Custom': 'value', 'Authorization': 'Bearer token' },
      });

      assert.strictEqual(customHeaderValue, 'value');
      assert.strictEqual(authHeaderValue, 'Bearer token');
    });

    it('should handle different HTTP methods', async () => {
      let capturedMethod: string | undefined;
      
      globalThis.fetch = async (input, init) => {
        capturedMethod = init?.method;
        return new Response(JSON.stringify({ data: 'ok' }), { status: 200 });
      };

      await x402Pay({
        url: 'https://api.example.com/data',
        method: 'POST',
        wallet: mockEvmWallet,
      });

      assert.strictEqual(capturedMethod, 'POST');
    });
  });
});
