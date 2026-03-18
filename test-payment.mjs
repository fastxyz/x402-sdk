import { x402Pay } from './packages/x402-client/dist/index.js';
import fs from 'fs';

// Load buyer wallet
const buyerKeyPath = process.env.HOME + '/.money/keys/evm.json';
const buyerKey = JSON.parse(fs.readFileSync(buyerKeyPath, 'utf8'));
const privateKey = buyerKey.privateKey.startsWith('0x') ? buyerKey.privateKey : `0x${buyerKey.privateKey}`;

// Derive address from private key
import { privateKeyToAccount } from 'viem/accounts';
const account = privateKeyToAccount(privateKey);
console.log('Buyer address:', account.address);

// Make the payment request
console.log('\nRequesting /api/premium...');
try {
  const result = await x402Pay({
    url: 'http://localhost:3000/api/premium',
    wallet: {
      type: 'evm',
      privateKey: privateKey,
      address: account.address,
    },
  });
  
  if (result.success) {
    console.log('\n✅ Payment successful!');
    console.log('Payment:', JSON.stringify(result.payment, null, 2));
    console.log('Response:', JSON.stringify(result.body, null, 2));
  } else {
    console.log('\n❌ Payment failed:', result.error);
  }
} catch (error) {
  console.error('\n❌ Error:', error.message);
  if (error.cause) console.error('Cause:', error.cause);
}
