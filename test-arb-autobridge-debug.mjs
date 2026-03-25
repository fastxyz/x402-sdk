import { bridgeFastusdcToUsdc } from './packages/x402-client/dist/bridge.js';
import { readFileSync } from 'fs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';

BigInt.prototype.toJSON = function() { return this.toString(); };
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const keyPath = process.env.HOME + '/.fast/keys/test-wallet.json';
const keyData = JSON.parse(readFileSync(keyPath, 'utf8'));
const privateKeyBytes = Buffer.from(keyData.privateKey, 'hex');
const publicKeyHex = Buffer.from(ed.getPublicKey(privateKeyBytes)).toString('hex');

const fastWallet = {
  type: 'fast',
  privateKey: keyData.privateKey,
  publicKey: publicKeyHex,
  address: keyData.address,
};

const logs = [];
const result = await bridgeFastusdcToUsdc({
  fastWallet,
  evmReceiverAddress: keyData.evmAddress,
  amount: 2n,
  network: 'arbitrum',
  verbose: true,
  logs,
});

console.log('Result:', result);
console.log('\n=== LOGS ===');
logs.forEach(l => console.log(l));
