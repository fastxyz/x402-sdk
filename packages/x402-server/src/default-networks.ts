/**
 * Default network configurations built from @fastxyz/sdk and @fastxyz/allset-sdk
 *
 * Token/asset configs are imported from SDKs for consistency.
 * Only x402-specific EIP-3009 metadata is defined locally.
 */

import { AllSetProvider } from "@fastxyz/allset-sdk/node";
import { resolveKnownFastToken } from "@fastxyz/sdk";

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
const FALLBACK_USDC: Record<string, { asset: string; decimals: number }> = {
  "arbitrum": { asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  "ethereum": { asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetworkAssetConfig {
  asset: string;
  decimals: number;
  extra?: {
    name?: string;
    version?: string;
    chainId?: number;
    rpcUrl?: string;
  };
}

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

// ---------------------------------------------------------------------------
// Build defaults from SDKs
// ---------------------------------------------------------------------------

function buildEvmNetworkDefaults(): Record<string, NetworkAssetConfig> {
  const result: Record<string, NetworkAssetConfig> = {};
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
          asset: tokenConfig.evmAddress,
          decimals: tokenConfig.decimals,
          extra: {
            name: eip3009.name,
            version: eip3009.version,
          },
        };
      } else {
        // Use fallback if SDK doesn't have this network
        const fallback = FALLBACK_USDC[network];
        if (fallback) {
          result[network] = {
            asset: fallback.asset,
            decimals: fallback.decimals,
            extra: {
              name: eip3009.name,
              version: eip3009.version,
            },
          };
        }
      }
    } catch {
      // Use fallback on error
      const fallback = FALLBACK_USDC[network];
      if (fallback && eip3009) {
        result[network] = {
          asset: fallback.asset,
          decimals: fallback.decimals,
          extra: {
            name: eip3009.name,
            version: eip3009.version,
          },
        };
      }
    }
  }

  return result;
}

async function buildFastNetworkDefaults(): Promise<Record<string, NetworkAssetConfig>> {
  const result: Record<string, NetworkAssetConfig> = {};

  for (const network of ["testnet", "mainnet"] as const) {
    try {
      const token = await resolveKnownFastToken(network === "testnet" ? "testUSDC" : "fastUSDC", network);
      if (token) {
        result[`fast-${network}`] = {
          asset: "0x" + token.tokenId,
          decimals: token.decimals,
        };
      }
    } catch {
      // Fallback
    }
  }

  // Fallback if SDK resolution failed
  if (!result["fast-testnet"]) {
    result["fast-testnet"] = {
      asset: "0x9c52fe9465f57bc526c11aa0c048fd8709aa46abc06d15c80cbed9263d4d4df8", // testUSDC
      decimals: 6,
    };
  }
  if (!result["fast-mainnet"]) {
    result["fast-mainnet"] = {
      asset: "0xb4fdab846372740f747eb4b64ac0c22eaa159113f2d35b075027065fba419365", // fastUSDC
      decimals: 6,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cached defaults (built once)
// ---------------------------------------------------------------------------

let _cachedDefaults: Record<string, NetworkAssetConfig> | null = null;

export function getDefaultNetworksConfig(): Record<string, NetworkAssetConfig> {
  if (_cachedDefaults) return _cachedDefaults;

  // Build EVM defaults synchronously from allset-sdk
  const evmDefaults = buildEvmNetworkDefaults();

  // Fast defaults with fallback (async would complicate things)
  const fastDefaults: Record<string, NetworkAssetConfig> = {
    "fast-testnet": {
      asset: "0x9c52fe9465f57bc526c11aa0c048fd8709aa46abc06d15c80cbed9263d4d4df8", // testUSDC
      decimals: 6,
    },
    "fast-mainnet": {
      asset: "0xb4fdab846372740f747eb4b64ac0c22eaa159113f2d35b075027065fba419365", // fastUSDC
      decimals: 6,
    },
  };

  _cachedDefaults = { ...evmDefaults, ...fastDefaults };
  return _cachedDefaults;
}

// For backwards compat
export const DEFAULT_NETWORKS_CONFIG = getDefaultNetworksConfig();
