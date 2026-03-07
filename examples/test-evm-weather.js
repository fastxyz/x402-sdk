/**
 * Test x402 client - EVM payment for /api/weather (with auto-bridge)
 */

import { x402Pay } from 'x402-client';

const SERVER_URL = 'http://localhost:3000';
const ENDPOINT = '/api/weather';

// Buyer wallets (correct keys)
const BUYER_FAST_PRIVATE = 'a7d4fa67fcf408d1154e22c4c83c6e1f8d4420b6dfb5a3c2f0417c509bd069b3';
const BUYER_EVM_PRIVATE = '0xb88b23e5b66a8739d8a4446d503c33f9817f53930f439a0394d9acc02d51be00';
const BUYER_EVM_ADDRESS = '0x4e94048ab8fD1A0f5D81ff458CA566198ce4C650';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  x402 Buyer Test - EVM Payment (Arbitrum Sepolia) + Auto-Bridge');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  // Build Fast wallet object
  const { bech32m } = await import('@scure/base');
  const ed = await import('@noble/ed25519');
  const { sha512 } = await import('@noble/hashes/sha512');
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
  
  const privKeyBytes = Buffer.from(BUYER_FAST_PRIVATE, 'hex');
  const pubKeyBytes = await ed.getPublicKeyAsync(privKeyBytes);
  const publicKey = Buffer.from(pubKeyBytes).toString('hex');
  const fastAddress = bech32m.encode('fast', bech32m.toWords(pubKeyBytes));
  
  const fastWallet = {
    type: 'fast',
    privateKey: BUYER_FAST_PRIVATE,
    publicKey: publicKey,
    address: fastAddress,
  };

  // Build EVM wallet object  
  const evmWallet = {
    type: 'evm',
    privateKey: BUYER_EVM_PRIVATE,
    address: BUYER_EVM_ADDRESS,
  };

  console.log('Buyer Fast Address:', fastAddress);
  console.log('Buyer EVM Address: ', BUYER_EVM_ADDRESS);
  console.log();
  console.log('Requesting:', SERVER_URL + ENDPOINT);
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  const startTime = Date.now();

  try {
    const result = await x402Pay({
      url: SERVER_URL + ENDPOINT,
      method: 'GET',
      wallet: [fastWallet, evmWallet],  // Both wallets for auto-bridge
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
    console.log();
    
    if (result.paymentDetails) {
      console.log('Payment Details:');
      console.log('  Network:', result.paymentDetails.network);
      console.log('  Amount:', result.paymentDetails.amount);
      console.log('  To:', result.paymentDetails.payTo);
      if (result.paymentDetails.bridged) {
        console.log('  Bridged: ✅ fastUSDC → USDC');
      }
    }
    console.log();

    if (result.body) {
      console.log('Response Body:');
      console.log(JSON.stringify(result.body, null, 2));
    } else if (result.error) {
      console.log('Error:', result.error);
    }
    
    console.log();
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (err) {
    console.error('Fatal error:', err);
  }
}

main();
