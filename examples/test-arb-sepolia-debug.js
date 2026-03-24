#!/usr/bin/env node
import { privateKeyToAccount } from 'viem/accounts';
import { ed25519 } from '@noble/curves/ed25519';
import fs from 'fs';
import path from 'path';

// Load keys
const fastKeyPath = path.join(process.env.HOME, '.fast/keys/test-wallet.json');
const fastKey = JSON.parse(fs.readFileSync(fastKeyPath, 'utf8'));
const fastPrivateKey = fastKey.privateKey;
const fastPublicKey = Buffer.from(ed25519.getPublicKey(Buffer.from(fastPrivateKey, 'hex'))).toString('hex');

const walletsPath = path.join(process.env.HOME, '.openclaw/workspace/x402-demo-wallets/wallets.json');
const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf8'));
const evmPrivateKey = '0x' + wallets.buyer.evmPrivateKey;
const evmAccount = privateKeyToAccount(evmPrivateKey);

console.log('Fast Wallet:', fastKey.address);
console.log('EVM Wallet:', evmAccount.address);

// Test getFastBalance directly
import { getFastBalance } from '@fastxyz/x402-client';

const fastWallet = {
  type: 'fast',
  privateKey: fastPrivateKey,
  publicKey: fastPublicKey,
  address: fastKey.address,
};

console.log('\nTesting getFastBalance...');
try {
  const balance = await getFastBalance(fastWallet);
  console.log('Fast USDC Balance:', balance.toString(), '(' + (Number(balance) / 1e6) + ' USDC)');
} catch (err) {
  console.error('getFastBalance error:', err.message);
}
