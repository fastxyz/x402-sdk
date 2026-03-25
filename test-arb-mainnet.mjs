#!/usr/bin/env node
// Test x402 payment on Arbitrum mainnet
// ⚠️ REAL MONEY - BE CAREFUL
import { readFileSync } from 'fs';

const MERCHANT_URL = 'http://localhost:4021';
const FACILITATOR_URL = 'http://localhost:4020';

// Load test-wallet
const wallet = JSON.parse(readFileSync(process.env.HOME + '/.fast/keys/test-wallet.json', 'utf8'));
console.log('Test wallet EVM:', wallet.evmAddress);
console.log('');

// Step 1: Check merchant endpoint (should get 402)
console.log('=== Step 1: Check merchant endpoint ===');
const checkRes = await fetch(`${MERCHANT_URL}/api/arbitrum`);
console.log('Status:', checkRes.status);

if (checkRes.status !== 402) {
  console.log('Expected 402, got', checkRes.status);
  process.exit(1);
}

const paymentRequired = await checkRes.json();
console.log('Payment required:', JSON.stringify(paymentRequired, null, 2));
console.log('');

// Step 2: Check if we have the x402-client available
console.log('=== Step 2: Check payment requirements ===');
const accepts = paymentRequired.accepts?.[0];
if (!accepts) {
  console.log('No payment requirements found');
  process.exit(1);
}

console.log('Network:', accepts.network);
console.log('Amount:', accepts.maxAmountRequired, '(raw units)');
console.log('Pay to:', accepts.payTo);
console.log('Asset:', accepts.asset);
console.log('');

// ⚠️ STOP HERE - Don't actually make payment yet
console.log('=== PAUSING BEFORE PAYMENT ===');
console.log('Test wallet has 0 Arb USDC - would need to bridge from Fast');
console.log('Current Fast USDC: 0.089246');
console.log('');
console.log('To proceed, we need x402-client with bridge support.');
console.log('Checking x402-client package...');
