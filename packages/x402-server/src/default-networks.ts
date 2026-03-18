/**
 * Default network configurations for x402-server
 *
 * Bundled defaults for payment requirement assets.
 * Users can override via ~/.x402/networks.json or custom config path.
 */

export interface NetworkAssetConfig {
  /** Token contract address (EVM) or token ID (Fast) */
  asset: string;
  /** Token decimals */
  decimals: number;
  /** Extra metadata for EIP-3009 (EVM networks) */
  extra?: {
    name?: string;
    version?: string;
    chainId?: number;
    rpcUrl?: string;
  };
}

export const DEFAULT_NETWORKS_CONFIG: Record<string, NetworkAssetConfig> = {
  "fast-testnet": {
    asset: "0xb4cf1b9e227bb6a21b959338895dfb39b8d2a96dfa1ce5dd633561c193124cb5",
    decimals: 6,
  },
  "fast-mainnet": {
    asset: "0xb4cf1b9e227bb6a21b959338895dfb39b8d2a96dfa1ce5dd633561c193124cb5",
    decimals: 6,
  },
  "arbitrum-sepolia": {
    asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    decimals: 6,
    extra: {
      name: "USD Coin",
      version: "2",
    },
  },
  "arbitrum": {
    asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    extra: {
      name: "USD Coin",
      version: "2",
    },
  },
  "ethereum-sepolia": {
    asset: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    decimals: 6,
    extra: {
      name: "USD Coin",
      version: "2",
    },
  },
  "ethereum": {
    asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    extra: {
      name: "USD Coin",
      version: "2",
    },
  },
};
