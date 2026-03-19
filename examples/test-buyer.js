/**
 * Test Buyer - Request paid content using x402-client
 */
import { x402Pay } from '@fastxyz/x402-client';
import { FastProvider, FastWallet } from '@fastxyz/sdk';

// Buyer Fast wallet (has SETUSDC balance)
const FAST_PRIVATE_KEY = 'a7d4fa67fcf408d1154e22c4c83c6e1f8d4420b6dfb5a3c2f0417c509bd069b3';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  x402 Buyer Test - Fast Network');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

const url = 'http://23.88.118.41:3000/api/fast-weather';

console.log(`Requesting: ${url}`);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

try {
  const fastProvider = new FastProvider({ network: 'testnet' });
  const fastWallet = await FastWallet.fromPrivateKey(FAST_PRIVATE_KEY, fastProvider);

  console.log(`Buyer Address: ${fastWallet.address}`);
  console.log('');

  const result = await x402Pay({
    url,
    wallet: fastWallet,
    verbose: true,
  });

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESULT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Success: ${result.success}`);
  console.log(`Status: ${result.statusCode}`);
  console.log('');
  
  if (result.payment) {
    console.log('Payment Details:');
    console.log(`  Network: ${result.payment.network}`);
    console.log(`  Amount: ${result.payment.amount}`);
    console.log(`  To: ${result.payment.recipient}`);
  }
  
  console.log('');
  console.log('Response Body:');
  console.log(JSON.stringify(result.body, null, 2));
  
  if (result.logs) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  VERBOSE LOGS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    result.logs.forEach(line => console.log(line));
  }
} catch (err) {
  console.error('');
  console.error('ERROR:', err instanceof Error ? err.message : err);
  console.error('');
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}
