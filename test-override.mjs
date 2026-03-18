import { loadChainConfig, loadNetworkConfig } from './packages/x402-facilitator/dist/config.js';

console.log('=== x402-facilitator Config Override Test ===\n');

const chainConfig = loadChainConfig();
console.log('Arbitrum Sepolia chainId:', chainConfig['arbitrum-sepolia']?.chainId);
console.log('Expected: 421614');
console.log('Match:', chainConfig['arbitrum-sepolia']?.chainId === 421614);

console.log('\nArbitrum Sepolia USDC:', chainConfig['arbitrum-sepolia']?.usdc);
console.log('Expected: 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d');

console.log('\n=== x402-server Config Override Test ===\n');

import { loadNetworkConfig as loadServerConfig } from './packages/x402-server/dist/config.js';
const serverConfig = loadServerConfig();
console.log('Networks loaded:', Object.keys(serverConfig));
console.log('arbitrum-sepolia asset:', serverConfig['arbitrum-sepolia']?.asset);
