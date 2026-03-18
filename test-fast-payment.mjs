import { x402Pay } from './packages/x402-client/dist/index.js';
import fs from 'fs';

// Load Fast wallet (buyer)
const fastKeyPath = process.env.HOME + '/.money/keys/fast-buyer.json';
const fastKey = JSON.parse(fs.readFileSync(fastKeyPath, 'utf8'));
const fastAddress = 'fast15cqs95q832e63a2ypcelvuzev7g5x8t0vc4kdyquumwdhvw0ykdsmjz48q';

console.log('Buyer Fast address:', fastAddress);
console.log('\nRequesting /api/fast-data (0.01 testUSDC on Fast network)...\n');

try {
  const result = await x402Pay({
    url: 'http://localhost:3000/api/fast-data',
    verbose: true,
    wallet: {
      type: 'fast',
      privateKey: fastKey.privateKey,
      address: fastAddress,
    },
  });
  
  if (result.logs) {
    console.log('--- Logs ---');
    result.logs.forEach(log => console.log(log));
    console.log('--- End Logs ---\n');
  }
  
  if (result.success) {
    console.log('✅ Payment successful!');
    console.log('Payment:', JSON.stringify(result.payment, null, 2));
    console.log('Response:', JSON.stringify(result.body, null, 2));
  } else {
    console.log('❌ Payment failed:', result.error);
  }
} catch (error) {
  console.error('❌ Error:', error.message);
}
