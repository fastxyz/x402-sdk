/**
 * Default chain configurations for x402-facilitator
 *
 * Bundled defaults for EVM chains and Fast network RPC URLs.
 * Users can override via ~/.x402/chains.json or custom config path.
 */

export interface EvmChainJsonConfig {
  chainId: number;
  rpcUrl: string;
  usdc: {
    address: string;
    name: string;
    version: string;
    decimals: number;
  };
}

export interface FastChainJsonConfig {
  rpcUrl: string;
}

export interface ChainJsonConfig {
  evm: Record<string, EvmChainJsonConfig>;
  fast: Record<string, FastChainJsonConfig>;
}

export const DEFAULT_CHAINS_CONFIG: ChainJsonConfig = {
  evm: {
    "arbitrum-sepolia": {
      chainId: 421614,
      rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc",
      usdc: {
        address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      },
    },
    "arbitrum": {
      chainId: 42161,
      rpcUrl: "https://arb1.arbitrum.io/rpc",
      usdc: {
        address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      },
    },
    "ethereum-sepolia": {
      chainId: 11155111,
      rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
      usdc: {
        address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      },
    },
    "ethereum": {
      chainId: 1,
      rpcUrl: "https://ethereum-rpc.publicnode.com",
      usdc: {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        name: "USD Coin",
        version: "2",
        decimals: 6,
      },
    },
  },
  fast: {
    "fast-testnet": {
      rpcUrl: "https://testnet.api.fast.xyz/proxy",
    },
    "fast-mainnet": {
      rpcUrl: "https://api.fast.xyz/proxy",
    },
  },
};
