import { createPublicClient, http, parseAbi } from 'viem';
import { arbitrumSepolia } from 'viem/chains';

const client = createPublicClient({
  chain: arbitrumSepolia,
  transport: http('https://sepolia-rollup.arbitrum.io/rpc'),
});

const USDC_ADDRESS = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';
const BUYER_ADDRESS = '0x4e94048ab8fD1A0f5D81ff458CA566198ce4C650';

const balance = await client.readContract({
  address: USDC_ADDRESS,
  abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
  functionName: 'balanceOf',
  args: [BUYER_ADDRESS],
});

console.log('Buyer EVM USDC balance:', Number(balance) / 1e6);
