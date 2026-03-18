/**
 * Test x402 client - Premium endpoint ($0.05 EVM payment with auto-bridge)
 */

import { x402Pay } from '@fastxyz/x402-client';
import { createEvmWallet } from '@fastxyz/allset-sdk';
import { FastProvider, FastWallet } from '@fastxyz/sdk';

const SERVER_URL = 'http://localhost:3000';
const ENDPOINT = '/api/premium/forecast';

// Buyer wallets
const BUYER_FAST_PRIVATE = 'a7d4fa67fcf408d1154e22c4c83c6e1f8d4420b6dfb5a3c2f0417c509bd069b3';
const BUYER_EVM_PRIVATE = '0xb88b23e5b66a8739d8a4446d503c33f9817f53930f439a0394d9acc02d51be00';
const BUYER_EVM_ADDRESS = '0x4e94048ab8fD1A0f5D81ff458CA566198ce4C650';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  x402 Buyer Test - Premium Endpoint ($0.05 EVM + Auto-Bridge)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  const fastProvider = new FastProvider({ network: 'testnet' });
  const fastWallet = await FastWallet.fromPrivateKey(BUYER_FAST_PRIVATE, fastProvider);
  const evmWallet = createEvmWallet(BUYER_EVM_PRIVATE);

  console.log('Buyer Fast Address:', fastWallet.address);
  console.log('Buyer EVM Address: ', BUYER_EVM_ADDRESS);
  console.log();
  console.log('Requesting:', SERVER_URL + ENDPOINT);
  console.log('Price: $0.05 USDC');
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  const startTime = Date.now();

  try {
    const result = await x402Pay({
      url: SERVER_URL + ENDPOINT,
      method: 'GET',
      wallet: [evmWallet, fastWallet],
      verbose: true,
    });

    const elapsed = Date.now() - startTime;

    // Print verbose logs
    if (result.logs && result.logs.length > 0) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  VERBOSE LOGS');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log();
      for (const log of result.logs) {
        console.log(log);
      }
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  RESULT');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();
    console.log('Success:', result.success);
    console.log('Time:', elapsed, 'ms');
    console.log('Note:', result.note);
    console.log();
    
    if (result.payment) {
      console.log('Payment Details:');
      console.log('  Network:', result.payment.network);
      console.log('  Amount:', result.payment.amount);
      console.log('  To:', result.payment.recipient);
      if (result.payment.bridged) {
        console.log('  Bridged: ✅ fastUSDC → USDC');
      }
    }
    console.log();

    if (result.body) {
      console.log('Response Body:');
      console.log(JSON.stringify(result.body, null, 2));
    }
    
    console.log();
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (err) {
    console.error('Fatal error:', err instanceof Error ? err.message : err);
  }
}

main();
