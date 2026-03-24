/**
 * Test Buyer - Request paid content using x402-client (EVM with auto-bridge)
 */
import { x402Pay } from '@fastxyz/x402-client';
import { bech32m } from '@scure/base';

// Buyer EVM wallet - set via environment variables
const EVM_PRIVATE_KEY = process.env.EVM_PRIVATE_KEY;
const EVM_ADDRESS = process.env.EVM_ADDRESS;

// Buyer Fast wallet (for auto-bridge) - set via environment variables
const FAST_PRIVATE_KEY = process.env.FAST_PRIVATE_KEY;
const FAST_PUBLIC_KEY = process.env.FAST_PUBLIC_KEY;

if (!EVM_PRIVATE_KEY || !EVM_ADDRESS) {
  console.error('ERROR: EVM_PRIVATE_KEY and EVM_ADDRESS environment variables required');
  process.exit(1);
}
if (!FAST_PRIVATE_KEY || !FAST_PUBLIC_KEY) {
  console.error('ERROR: FAST_PRIVATE_KEY and FAST_PUBLIC_KEY environment variables required');
  process.exit(1);
}

// Derive Fast address
function deriveFastAddress(pubKeyHex) {
  const pubKeyBytes = Buffer.from(pubKeyHex, 'hex');
  return bech32m.encode('fast', bech32m.toWords(pubKeyBytes));
}
const FAST_ADDRESS = deriveFastAddress(FAST_PUBLIC_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  x402 Buyer Test - EVM (Arbitrum Sepolia) with Auto-Bridge');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log(`Buyer EVM Address: ${EVM_ADDRESS}`);
console.log(`Buyer Fast Address: ${FAST_ADDRESS}`);
console.log('');

const url = 'http://localhost:3000/api/weather';

console.log(`Requesting: ${url}`);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');

try {
  const result = await x402Pay({
    url,
    wallet: [
      {
        type: 'evm',
        privateKey: EVM_PRIVATE_KEY,
        address: EVM_ADDRESS,
      },
      {
        type: 'fast',
        privateKey: FAST_PRIVATE_KEY,
        publicKey: FAST_PUBLIC_KEY,
        address: FAST_ADDRESS,
      },
    ],
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
    if (result.payment.bridged) {
      console.log(`  Bridged: ${result.payment.bridgeAmount} fastUSDC → USDC`);
    }
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
