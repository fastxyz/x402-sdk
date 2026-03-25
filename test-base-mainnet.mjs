#!/usr/bin/env node
/**
 * Test x402 Base mainnet payment with auto-bridge
 */
import { readFileSync } from 'fs';
import { createPublicClient, http, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { FastProvider } from '@fastxyz/sdk';
import { x402Pay } from './packages/x402-client/dist/index.js';

const MERCHANT_URL = 'http://localhost:4021';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_TOKEN_ID = 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130';

const USDC_ABI = [{
  name: 'balanceOf',
  type: 'function',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view'
}];

// Load test-wallet
const testWalletJson = JSON.parse(readFileSync(process.env.HOME + '/.fast/keys/test-wallet.json', 'utf8'));
const merchantEvm = '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372';
const merchantFast = 'fast1u9nqllcflassw406wgxptp2pegazwgd3zmmt4fq5qefx2e2dk08sw0v2ag';

const fastProvider = new FastProvider({ network: 'mainnet' });
const baseClient = createPublicClient({ chain: base, transport: http() });

function getUsdcBalance(info) {
  if (!info?.token_balance) return 0n;
  for (const [tokenIdBytes, balance] of info.token_balance) {
    const tokenHex = Buffer.from(tokenIdBytes).toString('hex');
    if (tokenHex === USDC_TOKEN_ID) {
      const balStr = String(balance);
      if (/^[0-9]+$/.test(balStr)) return BigInt(balStr);
      return BigInt('0x' + balStr);
    }
  }
  return 0n;
}

async function getBalances() {
  const twFastInfo = await fastProvider.getAccountInfo(testWalletJson.address);
  const twFastUsdc = getUsdcBalance(twFastInfo);
  const twBaseUsdc = await baseClient.readContract({ address: BASE_USDC, abi: USDC_ABI, functionName: 'balanceOf', args: [testWalletJson.evmAddress] });

  const mFastInfo = await fastProvider.getAccountInfo(merchantFast);
  const mFastUsdc = getUsdcBalance(mFastInfo);
  const mBaseUsdc = await baseClient.readContract({ address: BASE_USDC, abi: USDC_ABI, functionName: 'balanceOf', args: [merchantEvm] });

  return {
    testWallet: { fastUsdc: (Number(twFastUsdc) / 1e6).toFixed(6), baseUsdc: formatUnits(twBaseUsdc, 6) },
    merchant: { fastUsdc: (Number(mFastUsdc) / 1e6).toFixed(6), baseUsdc: formatUnits(mBaseUsdc, 6) }
  };
}

async function main() {
  console.log('=== BEFORE BALANCES ===');
  const before = await getBalances();
  console.log('TEST-WALLET: Fast USDC:', before.testWallet.fastUsdc, '| Base USDC:', before.testWallet.baseUsdc);
  console.log('MERCHANT: Fast USDC:', before.merchant.fastUsdc, '| Base USDC:', before.merchant.baseUsdc);
  console.log('');

  // Setup wallets
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

  console.log('=== EXECUTING x402 BASE PAYMENT ===');
  console.log('Endpoint:', `${MERCHANT_URL}/api/base`);
  console.log('Amount: 0.000001 USDC');
  console.log('Flow: Fast USDC → Bridge to Base → EIP-3009 → Merchant');
  console.log('');

  try {
    const result = await x402Pay({
      url: `${MERCHANT_URL}/api/base`,
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

  console.log('Waiting 10s for settlement...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('');
  console.log('=== AFTER BALANCES ===');
  const after = await getBalances();
  console.log('TEST-WALLET: Fast USDC:', after.testWallet.fastUsdc, '| Base USDC:', after.testWallet.baseUsdc);
  console.log('MERCHANT: Fast USDC:', after.merchant.fastUsdc, '| Base USDC:', after.merchant.baseUsdc);
  console.log('');

  console.log('=== CHANGES ===');
  console.log('TEST-WALLET: Fast USDC:', (parseFloat(after.testWallet.fastUsdc) - parseFloat(before.testWallet.fastUsdc)).toFixed(6),
              '| Base USDC:', (parseFloat(after.testWallet.baseUsdc) - parseFloat(before.testWallet.baseUsdc)).toFixed(6));
  console.log('MERCHANT: Fast USDC:', (parseFloat(after.merchant.fastUsdc) - parseFloat(before.merchant.fastUsdc)).toFixed(6),
              '| Base USDC:', (parseFloat(after.merchant.baseUsdc) - parseFloat(before.merchant.baseUsdc)).toFixed(6));
}

main().catch(console.error);
