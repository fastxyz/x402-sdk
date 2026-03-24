#!/usr/bin/env node
/**
 * Test x402 payment using test-wallet
 */

import { x402Pay } from '@fastxyz/x402-client';
import { ed25519 } from '@noble/curves/ed25519';
import fs from 'fs';
import path from 'path';

// Load test-wallet keys
const fastKeyPath = path.join(process.env.HOME, '.fast/keys/test-wallet.json');
const fastKey = JSON.parse(fs.readFileSync(fastKeyPath, 'utf8'));

// Derive publicKey from privateKey if not present
const privateKey = fastKey.privateKey;
const publicKey = fastKey.publicKey || Buffer.from(ed25519.getPublicKey(Buffer.from(privateKey, 'hex'))).toString('hex');

const wallet = {
  type: 'fast',
  privateKey,
  publicKey,
  address: fastKey.address,
};

console.log('=== Testing x402 Payment ===');
console.log('Endpoint: http://localhost:4021/api/fast');
console.log('Wallet:', wallet.address);
console.log('');

try {
  const result = await x402Pay({
    url: 'http://localhost:4021/api/fast',
    wallet,
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
  if (err.cause) console.error('Cause:', err.cause);
}
