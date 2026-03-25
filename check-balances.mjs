import { createPublicClient, http, formatUnits } from 'viem';
import { arbitrum, arbitrumSepolia, base, sepolia } from 'viem/chains';

// Wallets
const WALLETS = {
  'test-wallet': {
    fast: 'fast13870arxtayr6nejepxtazf7v56pzmmzdqztj27gh6n4k5ret96ps5stts9',
    evm: '0x3681298cBaC0982386EDeD8F91C4F429B558f4FD',
  },
  'merchant': {
    fast: 'fast1hjayqnp44xevxvw52jwkgfyrzvquld7eu4383adp3vht9msqtw0s2sz9mv',
    evm: '0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372',
  },
  'facilitator': {
    fast: null,
    evm: '0x3CfD6Ee85D6126632E8d50A1fa4827395e01F481',
  },
};

// USDC addresses
const USDC = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  'arbitrum-sepolia': '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
  'ethereum-sepolia': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
};

// Fast token IDs
const FAST_TOKENS = {
  mainnet: 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130',
  testnet: 'd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46',
};

// EVM clients
const clients = {
  base: createPublicClient({ chain: base, transport: http('https://mainnet.base.org') }),
  arbitrum: createPublicClient({ chain: arbitrum, transport: http('https://arb1.arbitrum.io/rpc') }),
  'arbitrum-sepolia': createPublicClient({ chain: arbitrumSepolia, transport: http('https://sepolia-rollup.arbitrum.io/rpc') }),
  'ethereum-sepolia': createPublicClient({ chain: sepolia, transport: http('https://eth-sepolia.public.blastapi.io') }),
};

const ERC20_ABI = [{
  name: 'balanceOf',
  type: 'function',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ type: 'uint256' }],
}];

async function getEvmBalance(chain, address) {
  try {
    const client = clients[chain];
    const usdc = await client.readContract({
      address: USDC[chain],
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    });
    const eth = await client.getBalance({ address });
    return {
      usdc: formatUnits(usdc, 6),
      eth: formatUnits(eth, 18),
    };
  } catch (e) {
    return { usdc: 'error', eth: 'error' };
  }
}

async function getFastBalance(address, network) {
  try {
    const rpc = network === 'mainnet' 
      ? 'https://api.fast.xyz/proxy'
      : 'https://testnet.api.fast.xyz/proxy';
    const tokenId = FAST_TOKENS[network];
    
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'fastset_getAccountInfo',
        params: [address],
      }),
    });
    const data = await res.json();
    if (!data.result?.token_balance) return '0';
    
    for (const [tid, hexAmount] of data.result.token_balance) {
      const tidHex = Buffer.from(tid).toString('hex');
      if (tidHex === tokenId) {
        return formatUnits(BigInt('0x' + hexAmount), 6);
      }
    }
    return '0';
  } catch (e) {
    return 'error';
  }
}

async function main() {
  console.log('Checking balances...\n');
  
  for (const [name, wallet] of Object.entries(WALLETS)) {
    console.log(`━━━ ${name.toUpperCase()} ━━━`);
    if (wallet.fast) {
      console.log(`Fast: ${wallet.fast}`);
    }
    console.log(`EVM:  ${wallet.evm}\n`);
    
    // Fast balances
    if (wallet.fast) {
      const fastMainnet = await getFastBalance(wallet.fast, 'mainnet');
      const fastTestnet = await getFastBalance(wallet.fast, 'testnet');
      console.log(`Fast Mainnet USDC:     ${fastMainnet}`);
      console.log(`Fast Testnet testUSDC: ${fastTestnet}`);
    }
    
    // EVM balances
    for (const chain of ['base', 'arbitrum', 'ethereum-sepolia', 'arbitrum-sepolia']) {
      const bal = await getEvmBalance(chain, wallet.evm);
      console.log(`${chain.padEnd(18)} USDC: ${bal.usdc.padStart(12)}  ETH: ${bal.eth}`);
    }
    console.log('');
  }
}

main().catch(console.error);
