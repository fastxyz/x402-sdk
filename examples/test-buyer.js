/**
 * Test Buyer - Request paid content using x402-client
 */
import { x402Pay } from '../packages/x402-client/dist/index.js';
import { bech32m } from '@scure/base';

// Buyer Fast wallet (has SETUSDC balance)
const FAST_PRIVATE_KEY = 'a7d4fa67fcf408d1154e22c4c83c6e1f8d4420b6dfb5a3c2f0417c509bd069b3';
const FAST_PUBLIC_KEY = 'a60102d0078ab3a8f5440e33f670596791431d6f662b66901ce6dcdbb1cf259b';

// Derive Fast address from public key
function deriveFastAddress(pubKeyHex) {
  const pubKeyBytes = Buffer.from(pubKeyHex, 'hex');
  return bech32m.encode('fast', bech32m.toWords(pubKeyBytes));
}

const FAST_ADDRESS = deriveFastAddress(FAST_PUBLIC_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  x402 Buyer Test - Fast Network');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log(`Buyer Address: ${FAST_ADDRESS}`);
console.log('');

const url = 'http://23.88.118.41:3000/api/fast-weather';

console.log(`Requesting: ${url}`);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

try {
  const result = await x402Pay({
    url,
    wallet: {
      type: 'fast',
      privateKey: FAST_PRIVATE_KEY,
      publicKey: FAST_PUBLIC_KEY,
      address: FAST_ADDRESS,
    },
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
  console.error('ERROR:', err.message);
  console.error('');
  if (err.stack) {
    console.error(err.stack);
  }
}
