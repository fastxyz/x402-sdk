/**
 * Default chain configurations built from @fastxyz/sdk and @fastxyz/allset-sdk
 *
 * Chain/token configs are imported from SDKs for consistency.
 * Only x402-specific EIP-3009 metadata is defined locally.
 */

import { AllSetProvider } from "@fastxyz/allset-sdk/node";
import { getDefaultRpcUrl } from "@fastxyz/sdk";

// ---------------------------------------------------------------------------
// x402-specific EIP-3009 metadata (not in SDKs)
// ---------------------------------------------------------------------------

const EIP3009_USDC_METADATA: Record<string, { name: string; version: string }> = {
  "arbitrum-sepolia": { name: "USD Coin", version: "2" },
  "arbitrum": { name: "USD Coin", version: "2" },
  "ethereum-sepolia": { name: "USD Coin", version: "2" },
  "ethereum": { name: "USD Coin", version: "2" },
};

// Fallback USDC addresses for networks not yet in allset-sdk
const FALLBACK_USDC: Record<string, { address: string; chainId: number; decimals: number }> = {
  "arbitrum": { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", chainId: 42161, decimals: 6 },
  "ethereum": { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", chainId: 1, decimals: 6 },
};

// ---------------------------------------------------------------------------
// Network mapping helpers
// ---------------------------------------------------------------------------

const NETWORK_TO_CHAIN: Record<string, string> = {
  "arbitrum-sepolia": "arbitrum",
  "arbitrum": "arbitrum",
  "ethereum-sepolia": "ethereum",
  "ethereum": "ethereum",
};

function getNetworkType(network: string): "testnet" | "mainnet" {
  return network.includes("sepolia") || network.includes("testnet") ? "testnet" : "mainnet";
}

// Default RPC URLs (fallback if SDK doesn't have them)
const FALLBACK_RPC_URLS: Record<string, string> = {
  "arbitrum-sepolia": "https://sepolia-rollup.arbitrum.io/rpc",
  "arbitrum": "https://arb1.arbitrum.io/rpc",
  "ethereum-sepolia": "https://ethereum-sepolia-rpc.publicnode.com",
  "ethereum": "https://ethereum-rpc.publicnode.com",
};

// ---------------------------------------------------------------------------
// Types (for compatibility with chains.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Build defaults from SDKs
// ---------------------------------------------------------------------------

function buildEvmDefaults(): Record<string, EvmChainJsonConfig> {
  const result: Record<string, EvmChainJsonConfig> = {};
  const networks = ["arbitrum-sepolia", "arbitrum", "ethereum-sepolia", "ethereum"];

  for (const network of networks) {
    const chain = NETWORK_TO_CHAIN[network];
    const networkType = getNetworkType(network);
    const eip3009 = EIP3009_USDC_METADATA[network];

    if (!chain || !eip3009) continue;

    try {
      const allset = new AllSetProvider({ network: networkType });
      const chainConfig = allset.getChainConfig(chain);
      const tokenConfig = allset.getTokenConfig(chain, "USDC");

      if (chainConfig && tokenConfig) {
        result[network] = {
          chainId: chainConfig.chainId,
          rpcUrl: FALLBACK_RPC_URLS[network] ?? "",
          usdc: {
            address: tokenConfig.evmAddress,
            name: eip3009.name,
            version: eip3009.version,
            decimals: tokenConfig.decimals,
          },
        };
      } else {
        // Use fallback if SDK doesn't have this network
        const fallback = FALLBACK_USDC[network];
        if (fallback) {
          result[network] = {
            chainId: fallback.chainId,
            rpcUrl: FALLBACK_RPC_URLS[network] ?? "",
            usdc: {
              address: fallback.address,
              name: eip3009.name,
              version: eip3009.version,
              decimals: fallback.decimals,
            },
          };
        }
      }
    } catch {
      // Use fallback on error
      const fallback = FALLBACK_USDC[network];
      if (fallback && eip3009) {
        result[network] = {
          chainId: fallback.chainId,
          rpcUrl: FALLBACK_RPC_URLS[network] ?? "",
          usdc: {
            address: fallback.address,
            name: eip3009.name,
            version: eip3009.version,
            decimals: fallback.decimals,
          },
        };
      }
    }
  }

  return result;
}

async function buildFastDefaults(): Promise<Record<string, FastChainJsonConfig>> {
  const result: Record<string, FastChainJsonConfig> = {};

  try {
    result["fast-testnet"] = { rpcUrl: await getDefaultRpcUrl("testnet") };
    result["fast-mainnet"] = { rpcUrl: await getDefaultRpcUrl("mainnet") };
  } catch {
    // Fallback
    result["fast-testnet"] = { rpcUrl: "https://testnet.api.fast.xyz/proxy" };
    result["fast-mainnet"] = { rpcUrl: "https://api.fast.xyz/proxy" };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cached defaults (built once)
// ---------------------------------------------------------------------------

let _cachedDefaults: ChainJsonConfig | null = null;

export function getDefaultChainsConfig(): ChainJsonConfig {
  if (_cachedDefaults) return _cachedDefaults;

  // Build EVM defaults synchronously
  const evm = buildEvmDefaults();

  // For Fast, use fallback (async would complicate things)
  const fast: Record<string, FastChainJsonConfig> = {
    "fast-testnet": { rpcUrl: "https://testnet.api.fast.xyz/proxy" },
    "fast-mainnet": { rpcUrl: "https://api.fast.xyz/proxy" },
  };

  _cachedDefaults = { evm, fast };
  return _cachedDefaults;
}

// For backwards compat
export const DEFAULT_CHAINS_CONFIG: ChainJsonConfig = getDefaultChainsConfig();
