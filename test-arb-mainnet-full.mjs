#!/usr/bin/env node
/**
 * Test x402 payment on Arbitrum mainnet with auto-bridge
 * ⚠️ REAL MONEY - MINIMAL AMOUNT (0.000001 USDC)
 */
import { readFileSync } from 'fs';
import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum } from 'viem/chains';
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { x402Pay } from './packages/x402-client/dist/index.js';

const MERCHANT_URL = 'http://localhost:4021';
const FACILITATOR_URL = 'http://localhost:4020';
const ARB_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const USDC_ABI = [{
  name: 'balanceOf',
  type: 'function',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view'
}];

// Load wallets
const testWalletJson = JSON.parse(readFileSync(process.env.HOME + '/.fast/keys/test-wallet.json', 'utf8'));
const merchantEvm = '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372';
const merchantFast = 'fast1u9nqllcflassw406wgxptp2pegazwgd3zmmt4fq5qefx2e2dk08sw0v2ag';

// Setup clients
const arbClient = createPublicClient({ chain: arbitrum, transport: http() });
const fastProvider = new FastProvider({ network: 'mainnet' });

async function getFastBalance(address) {
  const res = await fetch('https://api.fast.xyz/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'account_balance',
      params: { address, token_id: '0xc655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130' }
    })
  });
  const data = await res.json();
  return BigInt(data.result?.balance ?? '0');
}

async function getBalances() {
  // Test wallet balances
  const twFastWallet = await FastWallet.fromKeyfile(process.env.HOME + '/.fast/keys/test-wallet.json', fastProvider);
  const twFastUsdc = await twFastWallet.balance('USDC');
  const twArbUsdc = await arbClient.readContract({ address: ARB_USDC, abi: USDC_ABI, functionName: 'balanceOf', args: [testWalletJson.evmAddress] });

  // Merchant balances
  const mFastUsdc = await getFastBalance(merchantFast);
  const mArbUsdc = await arbClient.readContract({ address: ARB_USDC, abi: USDC_ABI, functionName: 'balanceOf', args: [merchantEvm] });

  return {
    testWallet: {
      fastUsdc: twFastUsdc.amount,
      arbUsdc: formatUnits(twArbUsdc, 6),
    },
    merchant: {
      fastUsdc: formatUnits(mFastUsdc, 6),
      arbUsdc: formatUnits(mArbUsdc, 6),
    }
  };
}

async function main() {
  console.log('=== BEFORE BALANCES ===\n');
  const before = await getBalances();
  console.log('TEST-WALLET');
  console.log('  Fast USDC:', before.testWallet.fastUsdc);
  console.log('  Arb USDC:', before.testWallet.arbUsdc);
  console.log('');
  console.log('MERCHANT');
  console.log('  Fast USDC:', before.merchant.fastUsdc);
  console.log('  Arb USDC:', before.merchant.arbUsdc);
  console.log('');

  // Setup x402 wallets with type property
  const evmWallet = {
    type: 'evm',
    address: testWalletJson.evmAddress,
    privateKey: testWalletJson.privateKey.startsWith('0x') ? testWalletJson.privateKey : '0x' + testWalletJson.privateKey,
  };

  const fastWallet = {
    type: 'fast',
    address: testWalletJson.address,
    privateKey: testWalletJson.privateKey,
    rpcUrl: 'https://api.fast.xyz/proxy',
  };

  console.log('=== EXECUTING x402 PAYMENT ===');
  console.log('Endpoint:', `${MERCHANT_URL}/api/arbitrum`);
  console.log('Facilitator:', FACILITATOR_URL);
  console.log('Amount: 0.000001 USDC');
  console.log('Flow: Fast USDC → Bridge to Arb USDC → EIP-3009 → Merchant');
  console.log('');

  try {
    const result = await x402Pay({
      url: `${MERCHANT_URL}/api/arbitrum`,
      method: 'GET',
      wallet: [evmWallet, fastWallet],
      verbose: true,
    });

    console.log('=== PAYMENT RESULT ===');
    console.log('Success:', result.success);
    console.log('Status:', result.statusCode);
    console.log('Body:', JSON.stringify(result.body, null, 2));
    console.log('Note:', result.note);
    if (result.payment) {
      console.log('Payment:', JSON.stringify(result.payment, null, 2));
    }
    console.log('');
    if (result.logs?.length) {
      console.log('=== PAYMENT LOGS ===');
      result.logs.forEach(l => console.log(l));
    }
  } catch (err) {
    console.error('PAYMENT FAILED:', err.message);
    console.error(err);
    process.exit(1);
  }

  // Wait for settlement
  console.log('Waiting 10s for settlement...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('');
  console.log('=== AFTER BALANCES ===\n');
  const after = await getBalances();
  console.log('TEST-WALLET');
  console.log('  Fast USDC:', after.testWallet.fastUsdc);
  console.log('  Arb USDC:', after.testWallet.arbUsdc);
  console.log('');
  console.log('MERCHANT');
  console.log('  Fast USDC:', after.merchant.fastUsdc);
  console.log('  Arb USDC:', after.merchant.arbUsdc);
  console.log('');

  console.log('=== CHANGES ===');
  console.log('TEST-WALLET');
  console.log('  Fast USDC:', (parseFloat(after.testWallet.fastUsdc) - parseFloat(before.testWallet.fastUsdc)).toFixed(6));
  console.log('  Arb USDC:', (parseFloat(after.testWallet.arbUsdc) - parseFloat(before.testWallet.arbUsdc)).toFixed(6));
  console.log('MERCHANT');
  console.log('  Fast USDC:', (parseFloat(after.merchant.fastUsdc) - parseFloat(before.merchant.fastUsdc)).toFixed(6));
  console.log('  Arb USDC:', (parseFloat(after.merchant.arbUsdc) - parseFloat(before.merchant.arbUsdc)).toFixed(6));
}

main().catch(console.error);
