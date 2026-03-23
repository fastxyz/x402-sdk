#!/usr/bin/env node
/**
 * Test x402 payment on Arbitrum Sepolia with auto-bridge from Fast
 */

import { x402Pay } from '@fastxyz/x402-client';
import { privateKeyToAccount } from 'viem/accounts';
import { ed25519 } from '@noble/curves/ed25519';
import fs from 'fs';
import path from 'path';

// Load test-wallet Fast key
const fastKeyPath = path.join(process.env.HOME, '.fast/keys/test-wallet.json');
const fastKey = JSON.parse(fs.readFileSync(fastKeyPath, 'utf8'));
const fastPrivateKey = fastKey.privateKey;
const fastPublicKey = Buffer.from(ed25519.getPublicKey(Buffer.from(fastPrivateKey, 'hex'))).toString('hex');

// Load EVM key from wallet.json  
const walletsPath = path.join(process.env.HOME, '.openclaw/workspace/x402-demo-wallets/wallets.json');
const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf8'));
const evmPrivateKey = '0x' + wallets.buyer.evmPrivateKey;
const evmAccount = privateKeyToAccount(evmPrivateKey);

console.log('=== Testing x402 Payment (Arbitrum Sepolia with Auto-Bridge) ===');
console.log('Endpoint: http://localhost:4021/api/arb-sepolia');
console.log('Fast Wallet:', fastKey.address);
console.log('EVM Wallet:', evmAccount.address);
console.log('');

try {
  const result = await x402Pay({
    url: 'http://localhost:4021/api/arb-sepolia',
    wallet: [
      {
        type: 'evm',
        privateKey: evmPrivateKey,
        address: evmAccount.address,
      },
      {
        type: 'fast',
        privateKey: fastPrivateKey,
        publicKey: fastPublicKey,
        address: fastKey.address,
      },
    ],
    verbose: true,
  });

  console.log('=== Result ===');
  console.log('Success:', result.success);
  console.log('Status:', result.statusCode);
  console.log('Body:', JSON.stringify(result.body, null, 2));
  if (result.payment) {
    console.log('Payment:', JSON.stringify(result.payment, null, 2));
  }
  if (result.logs) {
    console.log('');
    console.log('=== Logs ===');
    result.logs.forEach(l => console.log(l));
  }
} catch (err) {
  console.error('=== Error ===');
  console.error(err.message);
  console.error(err.stack);
}
