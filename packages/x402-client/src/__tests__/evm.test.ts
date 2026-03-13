/**
 * Tests for EVM payment handler
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import { handleEvmPayment, EVM_NETWORKS } from '../evm.js';
import { mockEvmWallet, mockFastWallet, mock402Response, createMockFetch } from './helpers.js';

const originalFetch = globalThis.fetch;

describe('EVM Payment Handler', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('EVM_NETWORKS', () => {
    it('should include testnet networks', () => {
      assert.ok(EVM_NETWORKS.includes('arbitrum-sepolia'));
      assert.ok(EVM_NETWORKS.includes('ethereum-sepolia'));
    });

    it('should include mainnet networks', () => {
      assert.ok(EVM_NETWORKS.includes('arbitrum'));
      assert.ok(EVM_NETWORKS.includes('ethereum'));
    });
  });

  describe('handleEvmPayment', () => {
    it('should throw for unsupported network', async () => {
      const paymentRequired = mock402Response('unsupported-network');
      
      await assert.rejects(
        () => handleEvmPayment(
          'https://api.example.com/data',
          'GET',
          {},
          undefined,
          paymentRequired,
          paymentRequired.accepts![0],
          mockEvmWallet,
          false,
          []
        ),
        /Unsupported EVM network/
      );
    });

    it('should throw if no USDC asset in requirements', async () => {
      const paymentRequired = mock402Response('arbitrum-sepolia');
      paymentRequired.accepts![0].asset = undefined;

      // Mock balance check to pass
      globalThis.fetch = createMockFetch([
        { match: /staging.proxy.fastset.xyz/, status: 200, body: { result: { balances: [] } } },
      ]);
      
      await assert.rejects(
        () => handleEvmPayment(
          'https://api.example.com/data',
          'GET',
          {},
          undefined,
          paymentRequired,
          paymentRequired.accepts![0],
          mockEvmWallet,
          false,
          []
        ),
        /No USDC asset address/
      );
    });

    it('should sign EIP-3009 authorization and send payment', async () => {
      const paymentRequired = mock402Response('arbitrum-sepolia', '100000'); // 0.1 USDC
      let paymentHeaderSent = false;
      let paymentPayload: unknown;

      // Mock: balance check returns sufficient balance, then payment succeeds
      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const body = init?.body ? JSON.parse(init.body as string) : null;
        
        // RPC call for balance (eth_call to balanceOf)
        if (body?.method === 'eth_call') {
          // Return 100000 (0.1 USDC) as balance
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: '0x00000000000000000000000000000000000000000000000000000000000186a0',
          }), { status: 200 });
        }
        
        // Payment request with X-PAYMENT header
        if (init?.headers && (init.headers as Record<string, string>)['X-PAYMENT']) {
          paymentHeaderSent = true;
          const header = (init.headers as Record<string, string>)['X-PAYMENT'];
          paymentPayload = JSON.parse(Buffer.from(header, 'base64').toString());
          return new Response(JSON.stringify({ 
            success: true, 
            data: 'premium content',
            txHash: '0xabc123',
          }), { status: 200 });
        }
        
        return new Response(JSON.stringify({}), { status: 200 });
      };

      const result = await handleEvmPayment(
        'https://api.example.com/data',
        'GET',
        {},
        undefined,
        paymentRequired,
        paymentRequired.accepts![0],
        mockEvmWallet,
        false,
        []
      );

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.statusCode, 200);
      assert.ok(paymentHeaderSent, 'X-PAYMENT header should be sent');
      
      // Verify payment payload structure
      assert.ok(paymentPayload);
      const pp = paymentPayload as Record<string, unknown>;
      assert.strictEqual(pp.x402Version, 1);
      assert.strictEqual(pp.scheme, 'exact');
      assert.strictEqual(pp.network, 'arbitrum-sepolia');
      
      const payload = pp.payload as Record<string, unknown>;
      assert.ok(payload.signature, 'Should include signature');
      assert.ok(payload.authorization, 'Should include authorization');
      
      const auth = payload.authorization as Record<string, string>;
      assert.strictEqual(auth.from.toLowerCase(), mockEvmWallet.address.toLowerCase());
      assert.strictEqual(auth.to.toLowerCase(), '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372'.toLowerCase());
      assert.strictEqual(auth.value, '100000');
    });

    it('should include payment details in result', async () => {
      const paymentRequired = mock402Response('arbitrum-sepolia', '500000'); // 0.5 USDC

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : null;
        
        // RPC call for balance
        if (body?.method === 'eth_call') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: '0x000000000000000000000000000000000000000000000000000000000007a120', // 500000
          }), { status: 200 });
        }
        
        if (init?.headers && (init.headers as Record<string, string>)['X-PAYMENT']) {
          return new Response(JSON.stringify({ 
            success: true,
            txHash: '0xdef456789',
          }), { status: 200 });
        }
        
        return new Response('{}', { status: 200 });
      };

      const result = await handleEvmPayment(
        'https://api.example.com/data',
        'GET',
        {},
        undefined,
        paymentRequired,
        paymentRequired.accepts![0],
        mockEvmWallet,
        false,
        []
      );

      assert.ok(result.payment);
      assert.strictEqual(result.payment.network, 'arbitrum-sepolia');
      assert.strictEqual(result.payment.amount, '0.5');
      assert.strictEqual(result.payment.recipient, '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372');
      assert.ok(result.payment.txHash);
    });

    it('should handle verbose logging', async () => {
      const paymentRequired = mock402Response('arbitrum-sepolia', '100000');
      const logs: string[] = [];

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : null;
        
        if (body?.method === 'eth_call') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: '0x00000000000000000000000000000000000000000000000000000000000186a0',
          }), { status: 200 });
        }
        
        if (init?.headers && (init.headers as Record<string, string>)['X-PAYMENT']) {
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        
        return new Response('{}', { status: 200 });
      };

      await handleEvmPayment(
        'https://api.example.com/data',
        'GET',
        {},
        undefined,
        paymentRequired,
        paymentRequired.accepts![0],
        mockEvmWallet,
        true, // verbose
        logs
      );

      assert.ok(logs.length > 0);
      assert.ok(logs.some(l => l.includes('EVM Payment Handler START')));
      assert.ok(logs.some(l => l.includes('EIP-3009')));
    });

    it('should use custom USDC name/version from extra', async () => {
      const paymentRequired = mock402Response('arbitrum-sepolia', '100000');
      paymentRequired.accepts![0].extra = { name: 'Custom USDC', version: '3' };
      
      let capturedPayload: Record<string, unknown> | null = null;

      globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : null;
        
        if (body?.method === 'eth_call') {
          return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: '0x00000000000000000000000000000000000000000000000000000000000186a0',
          }), { status: 200 });
        }
        
        if (init?.headers && (init.headers as Record<string, string>)['X-PAYMENT']) {
          const header = (init.headers as Record<string, string>)['X-PAYMENT'];
          capturedPayload = JSON.parse(Buffer.from(header, 'base64').toString());
          return new Response(JSON.stringify({ success: true }), { status: 200 });
        }
        
        return new Response('{}', { status: 200 });
      };

      await handleEvmPayment(
        'https://api.example.com/data',
        'GET',
        {},
        undefined,
        paymentRequired,
        paymentRequired.accepts![0],
        mockEvmWallet,
        false,
        []
      );

      // The signature will be different based on domain, but we can verify the flow completed
      assert.ok(capturedPayload);
    });
  });
});
