import { x402Pay } from './packages/x402-client/dist/index.js';
import { readFileSync } from 'fs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

BigInt.prototype.toJSON = function() { return this.toString(); };
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const keyPath = process.env.HOME + '/.fast/keys/test-wallet.json';
const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));
const privateKeyBytes = Buffer.from(keyData.privateKey, 'hex');
const publicKeyHex = Buffer.from(ed.getPublicKey(privateKeyBytes)).toString('hex');

console.log('=== x402 Payment Test: Arbitrum with AUTO-BRIDGE 🌉 ===\n');

try {
  const result = await x402Pay({
    url: 'http://localhost:4021/api/arbitrum',
    wallet: [
      { type: 'evm', privateKey: '0x' + keyData.privateKey, address: keyData.evmAddress },
      { type: 'fast', privateKey: keyData.privateKey, publicKey: publicKeyHex, address: keyData.address },
    ],
    verbose: true,
  });
  
  console.log('Success:', result.success);
  if (!result.success) {
    console.log('Error:', result.error);
    console.log('\n=== ALL LOGS ===');
    result.logs?.forEach(l => console.log(l));
  }
} catch (error) {
  console.error('ERROR:', error.message);
  console.error(error.stack);
}
