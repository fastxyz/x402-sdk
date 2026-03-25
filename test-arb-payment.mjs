import { x402Pay } from './packages/x402-client/dist/index.js';
import { readFileSync } from 'fs';

const keyPath = process.env.HOME + '/.fast/keys/test-wallet.json';
const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));

console.log('=== x402 Payment Test: Arbitrum Mainnet ===');
console.log('Buyer:', keyData.evmAddress);
console.log('Target: http://localhost:4021/api/arbitrum');
console.log('Price: 0.000001 USDC');
console.log('');

try {
  console.log('→ Sending request...');
  const result = await x402Pay({
    url: 'http://localhost:4021/api/arbitrum',
    wallet: {
      type: 'evm',
      privateKey: '0x' + keyData.privateKey,
      address: keyData.evmAddress,
    },
    verbose: true,
  });
  
  console.log('');
  console.log('=== RESULT ===');
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Body:', result.body);
  } else {
    console.log('Error:', result.error);
    if (result.logs) {
      console.log('\n=== LOGS ===');
      result.logs.slice(-10).forEach(l => console.log(l));
    }
  }
} catch (error) {
  console.error('=== ERROR ===');
  console.error(error.message);
}
