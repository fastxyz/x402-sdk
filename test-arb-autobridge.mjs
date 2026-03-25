import { x402Pay } from './packages/x402-client/dist/index.js';
import { readFileSync } from 'fs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Fix BigInt serialization for JSON.stringify
BigInt.prototype.toJSON = function() { return this.toString(); };

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const keyPath = process.env.HOME + '/.fast/keys/test-wallet.json';
const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));

const privateKeyBytes = Buffer.from(keyData.privateKey, 'hex');
const publicKeyHex = Buffer.from(ed.getPublicKey(privateKeyBytes)).toString('hex');

console.log('=== x402 Payment Test: Arbitrum with AUTO-BRIDGE 🌉 ===');
console.log('Buyer Fast:', keyData.address);
console.log('Buyer EVM:', keyData.evmAddress);
console.log('Target: http://localhost:4021/api/arbitrum');
console.log('Price: 0.000001 USDC');
console.log('EVM Balance: 0 USDC (will auto-bridge from Fast)');
console.log('');

try {
  console.log('→ Sending request with BOTH wallets (auto-bridge enabled)...');
  const startTime = Date.now();
  
  const result = await x402Pay({
    url: 'http://localhost:4021/api/arbitrum',
    wallet: [
      {
        type: 'evm',
        privateKey: '0x' + keyData.privateKey,
        address: keyData.evmAddress,
      },
      {
        type: 'fast',
        privateKey: keyData.privateKey,
        publicKey: publicKeyHex,
        address: keyData.address,
      },
    ],
    verbose: true,
  });
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('');
  console.log('=== RESULT ===');
  console.log('Success:', result.success);
  console.log('Duration:', duration, 's');
  if (result.success) {
    console.log('Body:', result.body);
  } else {
    console.log('Error:', result.error);
  }
  
  // Show bridge-related logs
  if (result.logs?.length) {
    console.log('\n=== BRIDGE LOGS ===');
    result.logs.filter(l => 
      l.includes('Bridge') || l.includes('bridge') || 
      l.includes('Insufficient') || l.includes('sendToExternal')
    ).forEach(l => console.log(l));
  }
} catch (error) {
  console.error('=== ERROR ===');
  console.error(error.message);
}
