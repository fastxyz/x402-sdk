import { x402Pay } from '@fastxyz/x402-client';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import fs from 'fs';
import path from 'path';

// Configure ed25519
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// Load test-wallet
const testWalletPath = path.join(process.env.HOME, '.fast/keys/test-wallet.json');
const testWallet = JSON.parse(fs.readFileSync(testWalletPath, 'utf8'));

// Derive public key from private key
const privateKeyBytes = Buffer.from(testWallet.privateKey, 'hex');
const publicKeyBytes = ed.getPublicKey(privateKeyBytes.slice(0, 32));
const publicKey = Buffer.from(publicKeyBytes).toString('hex');

// Derive EVM address
const { privateKeyToAccount } = await import('viem/accounts');
const evmAccount = privateKeyToAccount(`0x${testWallet.privateKey}`);

console.log('=== x402 Payment Test: Ethereum Sepolia ===\n');
console.log('Buyer Fast:', testWallet.address);
console.log('Buyer EVM:', evmAccount.address);
console.log('');

// Build wallet objects WITH type property
const fastWallet = {
  type: 'fast',
  address: testWallet.address,
  publicKey,
  privateKey: testWallet.privateKey,
  rpcUrl: 'https://testnet.api.fast.xyz/proxy',
};

const evmWallet = {
  type: 'evm',
  address: evmAccount.address,
  privateKey: `0x${testWallet.privateKey}`,
};

console.log('Requesting /api/eth-sepolia from merchant...\n');

try {
  const result = await x402Pay({
    url: 'http://localhost:4021/api/eth-sepolia',
    method: 'GET',
    wallet: [evmWallet, fastWallet],
    facilitatorUrl: 'http://localhost:4020',
    verbose: true,
  });

  console.log('=== RESULT ===');
  console.log('Success:', result.success);
  console.log('Status:', result.statusCode);
  console.log('Payment:', JSON.stringify(result.payment, null, 2));
  console.log('Note:', result.note);
  
  if (result.logs) {
    console.log('\n=== LOGS ===');
    result.logs.forEach(l => console.log(l));
  }
} catch (err) {
  console.error('ERROR:', err.message);
  if (err.stack) console.error(err.stack);
}
