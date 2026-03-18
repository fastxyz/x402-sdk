import { x402Pay } from './packages/x402-client/dist/index.js';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';

// Load EVM wallet
const evmKeyPath = process.env.HOME + '/.money/keys/evm.json';
const evmKey = JSON.parse(fs.readFileSync(evmKeyPath, 'utf8'));
const evmPrivateKey = evmKey.privateKey.startsWith('0x') ? evmKey.privateKey : `0x${evmKey.privateKey}`;
const evmAccount = privateKeyToAccount(evmPrivateKey);

// Load Fast wallet
const fastKeyPath = process.env.HOME + '/.money/keys/fast-buyer.json';
const fastKey = JSON.parse(fs.readFileSync(fastKeyPath, 'utf8'));
const fastAddress = 'fast15cqs95q832e63a2ypcelvuzev7g5x8t0vc4kdyquumwdhvw0ykdsmjz48q';

console.log('Buyer EVM:', evmAccount.address);
console.log('Buyer Fast:', fastAddress);
console.log('\nRequesting /api/premium (0.01 USDC)...\n');

try {
  const result = await x402Pay({
    url: 'http://localhost:3000/api/premium',
    verbose: true,
    wallet: [
      { type: 'evm', privateKey: evmPrivateKey, address: evmAccount.address },
      { type: 'fast', privateKey: fastKey.privateKey, address: fastAddress },
    ],
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
