import { createPublicClient, http, erc20Abi } from 'viem';
import { sepolia } from 'viem/chains';
import { bech32m } from 'bech32';

// Addresses
const BUYER_FAST = 'fast1rsxfj84yhsskpr6g5ll2td7pkk3dnlsfwldsmawca4922qn3dqvqsxelzv';
const BUYER_EVM = '0x1253537Cd5848424C920DD54Ce6DFeBD75EDC471';
const MERCHANT_FAST = 'fast1hjayqnp44xevxvw52jwkgfyrzvquld7eu4383adp3vht9msqtw0s2sz9mv';
const MERCHANT_EVM = '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372';

const USDC_ETH_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const FAST_RPC = 'https://testnet.api.fast.xyz/proxy';
const testUSDC_TOKEN_ID = 'd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46';

async function getFastBalance(address) {
  const decoded = bech32m.decode(address);
  const pubkeyBytes = bech32m.fromWords(decoded.words);
  
  const res = await fetch(FAST_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'proxy_getAccountInfo',
      params: {
        address: Array.from(pubkeyBytes),
        token_balances_filter: [],
        state_key_filter: null,
        certificate_by_nonce: null,
      },
    }),
  });
  const data = await res.json();
  if (!data.result?.token_balance) return 0n;
  
  for (const [tokenId, hexAmount] of data.result.token_balance) {
    const tokenHex = Buffer.from(tokenId).toString('hex');
    if (tokenHex === testUSDC_TOKEN_ID) {
      return BigInt('0x' + hexAmount);
    }
  }
  return 0n;
}

async function getEvmBalance(address) {
  const client = createPublicClient({
    chain: sepolia,
    transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
  });
  
  try {
    const balance = await client.readContract({
      address: USDC_ETH_SEPOLIA,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });
    return balance;
  } catch {
    return 0n;
  }
}

const [buyerFast, buyerEvm, merchantFast, merchantEvm] = await Promise.all([
  getFastBalance(BUYER_FAST),
  getEvmBalance(BUYER_EVM),
  getFastBalance(MERCHANT_FAST),
  getEvmBalance(MERCHANT_EVM),
]);

console.log('BUYER (test-wallet):');
console.log(`  Fast testUSDC:        ${(Number(buyerFast) / 1e6).toFixed(6)}`);
console.log(`  Eth-Sepolia USDC:     ${(Number(buyerEvm) / 1e6).toFixed(6)}`);
console.log('');
console.log('MERCHANT:');
console.log(`  Fast testUSDC:        ${(Number(merchantFast) / 1e6).toFixed(6)}`);
console.log(`  Eth-Sepolia USDC:     ${(Number(merchantEvm) / 1e6).toFixed(6)}`);
