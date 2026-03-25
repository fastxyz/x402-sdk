import { x402Pay } from './packages/x402-client/dist/index.js';
import { readFileSync } from 'fs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

// Setup ed25519
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// Load test-wallet
const keyPath = process.env.HOME + '/.fast/keys/test-wallet.json';
const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));

// Derive public key from private key
const privateKeyBytes = Buffer.from(keyData.privateKey, 'hex');
const publicKeyHex = Buffer.from(ed.getPublicKey(privateKeyBytes)).toString('hex');

console.log('=== x402 Payment Test: Fast Mainnet ===');
console.log('Buyer:', keyData.address);
console.log('Target: http://localhost:4021/api/fast');
console.log('Price: 0.000001 USDC');
console.log('');

try {
  console.log('→ Sending request...');
  const result = await x402Pay({
    url: 'http://localhost:4021/api/fast',
    wallet: {
      type: 'fast',
      privateKey: keyData.privateKey,
      publicKey: publicKeyHex,
      address: keyData.address,
    },
    verbose: true,
  });
  
  console.log('');
  console.log('=== RESULT ===');
  console.log('Success:', result.success);
  if (result.success) {
    console.log('Status:', result.response?.status);
    console.log('Body:', result.body);
  } else {
    console.log('Error:', result.error);
  }
  if (result.logs?.length) {
    console.log('');
    console.log('=== LOGS ===');
    result.logs.forEach(l => console.log(l));
  }
} catch (error) {
  console.error('');
  console.error('=== ERROR ===');
  console.error(error.message);
  console.error(error.stack);
}
