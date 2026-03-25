#!/usr/bin/env node
/**
 * Test x402 Fast mainnet payment
 * Direct Fast-to-Fast payment (no bridge needed)
 */
import { readFileSync } from 'fs';
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { x402Pay } from './packages/x402-client/dist/index.js';

const MERCHANT_URL = 'http://localhost:4021';

// Load test-wallet
const testWalletJson = JSON.parse(readFileSync(process.env.HOME + '/.fast/keys/test-wallet.json', 'utf8'));
const merchantFast = 'fast1u9nqllcflassw406wgxptp2pegazwgd3zmmt4fq5qefx2e2dk08sw0v2ag';

const fastProvider = new FastProvider({ network: 'mainnet' });

async function getBalances() {
  const twFastWallet = await FastWallet.fromKeyfile(process.env.HOME + '/.fast/keys/test-wallet.json', fastProvider);
  const twBalance = await twFastWallet.balance('USDC');

  const res = await fetch('https://api.fast.xyz/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'account_balance',
      params: { address: merchantFast, token_id: '0xc655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130' }
    })
  });
  const data = await res.json();
  const mBalance = BigInt(data.result?.balance ?? '0');

  return {
    testWallet: { fastUsdc: twBalance.amount },
    merchant: { fastUsdc: (Number(mBalance) / 1e6).toFixed(6) }
  };
}

async function main() {
  console.log('=== BEFORE BALANCES ===');
  const before = await getBalances();
  console.log('TEST-WALLET Fast USDC:', before.testWallet.fastUsdc);
  console.log('MERCHANT Fast USDC:', before.merchant.fastUsdc);
  console.log('');

  // Setup Fast wallet for x402
  const fastWallet = {
    type: 'fast',
    address: testWalletJson.address,
    privateKey: testWalletJson.privateKey,
    rpcUrl: 'https://api.fast.xyz/proxy',
  };

  console.log('=== EXECUTING x402 FAST PAYMENT ===');
  console.log('Endpoint:', `${MERCHANT_URL}/api/fast`);
  console.log('Amount: 0.000001 USDC');
  console.log('Flow: Direct Fast → Fast payment');
  console.log('');

  try {
    const result = await x402Pay({
      url: `${MERCHANT_URL}/api/fast`,
      method: 'GET',
      wallet: [fastWallet],
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

  // Wait briefly for settlement
  console.log('Waiting 3s for settlement...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('');
  console.log('=== AFTER BALANCES ===');
  const after = await getBalances();
  console.log('TEST-WALLET Fast USDC:', after.testWallet.fastUsdc);
  console.log('MERCHANT Fast USDC:', after.merchant.fastUsdc);
  console.log('');

  console.log('=== CHANGES ===');
  console.log('TEST-WALLET Fast USDC:', (parseFloat(after.testWallet.fastUsdc) - parseFloat(before.testWallet.fastUsdc)).toFixed(6));
  console.log('MERCHANT Fast USDC:', (parseFloat(after.merchant.fastUsdc) - parseFloat(before.merchant.fastUsdc)).toFixed(6));
}

main().catch(console.error);
