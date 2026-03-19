/**
 * Test x402 client - Fast network payment for /api/fast-weather
 */

import { x402Pay } from '@fastxyz/x402-client';
import { FastProvider, FastWallet } from '@fastxyz/sdk';

const SERVER_URL = 'http://localhost:3000';
const ENDPOINT = '/api/fast-weather';

// Buyer Fast wallet
const BUYER_FAST_PRIVATE = 'a7d4fa67fcf408d1154e22c4c83c6e1f8d4420b6dfb5a3c2f0417c509bd069b3';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  x402 Buyer Test - Fast Network Payment');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  const fastProvider = new FastProvider({ network: 'testnet' });
  const fastWallet = await FastWallet.fromPrivateKey(BUYER_FAST_PRIVATE, fastProvider);

  console.log('Buyer Fast Address:', fastWallet.address);
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
      wallet: fastWallet,
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
