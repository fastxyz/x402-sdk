/**
 * Tests for Fast payment handler
 * 
 * Note: Full payment flow tests require valid Ed25519 keys and are
 * integration tests. These unit tests focus on configuration and exports.
 */

import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { FastWallet as SdkFastWallet } from '@fastxyz/sdk';
import { FAST_NETWORKS, handleFastPayment } from '../fast.js';
import { mock402Response, mockFastWallet } from './helpers.js';

const originalFetch = globalThis.fetch;

describe('Fast Payment Handler', () => {
  afterEach(() => {
    mock.restoreAll();
    globalThis.fetch = originalFetch;
  });

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

  describe('handleFastPayment', () => {
    it('should pass the exact asset token id to the SDK wallet', async () => {
      const paymentRequired = mock402Response('fast-testnet', '100000');
      paymentRequired.accepts![0].asset = '0xdeadbeef';

      let sendParams: { to: string; amount: string; token?: string } | undefined;

      mock.method(SdkFastWallet, 'fromPrivateKey', async () => ({
        address: mockFastWallet.address,
        send: async (params: { to: string; amount: string; token?: string }) => {
          sendParams = params;
          return {
            txHash: '0xabc123',
            certificate: { envelope: {}, signatures: [] },
          };
        },
      }) as never);

      globalThis.fetch = async () =>
        new Response(JSON.stringify({ success: true }), { status: 200 });

      const result = await handleFastPayment(
        'https://api.example.com/data',
        'GET',
        {},
        undefined,
        paymentRequired,
        paymentRequired.accepts![0],
        mockFastWallet,
        false,
        []
      );

      assert.strictEqual(result.success, true);
      assert.ok(sendParams);
      assert.strictEqual(sendParams?.token, '0xdeadbeef');
    });

    it('should convert raw amounts without Number precision loss', async () => {
      const rawAmount = '9007199254740993';
      const paymentRequired = mock402Response('fast-testnet', rawAmount);
      paymentRequired.accepts![0].asset =
        '0xd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46';

      let sendParams: { to: string; amount: string; token?: string } | undefined;

      mock.method(SdkFastWallet, 'fromPrivateKey', async () => ({
        address: mockFastWallet.address,
        send: async (params: { to: string; amount: string; token?: string }) => {
          sendParams = params;
          return {
            txHash: '0xabc123',
            certificate: { envelope: { transaction: { timestamp_nanos: 9007199254740993n } }, signatures: [] },
          };
        },
      }) as never);

      globalThis.fetch = async (_input, init) => {
        const paymentHeader = (init?.headers as Record<string, string>)['X-PAYMENT'];
        const decoded = JSON.parse(Buffer.from(paymentHeader, 'base64').toString()) as {
          payload: { transactionCertificate: { envelope: { transaction: { timestamp_nanos: string } } } };
        };
        assert.strictEqual(
          decoded.payload.transactionCertificate.envelope.transaction.timestamp_nanos,
          '9007199254740993'
        );

        return new Response(JSON.stringify({ success: true }), { status: 200 });
      };

      const result = await handleFastPayment(
        'https://api.example.com/data',
        'GET',
        {},
        undefined,
        paymentRequired,
        paymentRequired.accepts![0],
        mockFastWallet,
        false,
        []
      );

      assert.strictEqual(result.success, true);
      assert.ok(sendParams);
      assert.strictEqual(sendParams?.amount, '9007199254.740993');
    });
  });
});
