/**
 * Chain configurations for x402-facilitator
 *
 * Loads config from data/chains.json and maps to viem chain objects.
 * Edit data/chains.json to update addresses/RPC URLs without code changes.
 */

import { createRequire } from "module";
import {
  arbitrum,
  arbitrumSepolia,
  mainnet,
  sepolia,
  type Chain,
} from "viem/chains";
import type { EvmChainConfig } from "./types.js";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Load chain config from JSON
// ---------------------------------------------------------------------------

interface ChainJsonConfig {
  evm: Record<
    string,
    {
      chainId: number;
      rpcUrl: string;
      usdc: {
        address: string;
        name: string;
        version: string;
        decimals: number;
      };
    }
  >;
  fast: Record<string, { rpcUrl: string }>;
}

const chainsJson: ChainJsonConfig = require("../data/chains.json");

// ---------------------------------------------------------------------------
// Map chainId to viem chain objects
// ---------------------------------------------------------------------------

const VIEM_CHAINS: Record<number, Chain> = {
  421614: arbitrumSepolia,
  42161: arbitrum,
  11155111: sepolia,
  1: mainnet,
};

// ---------------------------------------------------------------------------
// Build EVM_CHAINS from JSON config
// ---------------------------------------------------------------------------

export const EVM_CHAINS: Record<string, EvmChainConfig> = {};

for (const [network, config] of Object.entries(chainsJson.evm)) {
  const viemChain = VIEM_CHAINS[config.chainId];
  if (!viemChain) {
    console.warn(`Unknown chainId ${config.chainId} for network ${network}`);
    continue;
  }

  EVM_CHAINS[network] = {
    chain: viemChain,
    usdcAddress: config.usdc.address as `0x${string}`,
    usdcName: config.usdc.name,
    usdcVersion: config.usdc.version,
  };
}

// ---------------------------------------------------------------------------
// Fast RPC endpoints from JSON
// ---------------------------------------------------------------------------

export const FAST_RPC_URLS: Record<string, string> = {};

for (const [network, config] of Object.entries(chainsJson.fast)) {
  FAST_RPC_URLS[network] = config.rpcUrl;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get chain config for a network
 */
export function getEvmChainConfig(network: string): EvmChainConfig | null {
  return EVM_CHAINS[network] || null;
}

/**
 * Get Fast RPC URL
 */
export function getFastRpcUrl(network: string): string {
  return FAST_RPC_URLS[network] || FAST_RPC_URLS["fast-testnet"];
}

/**
 * List of supported EVM networks
 */
export const SUPPORTED_EVM_NETWORKS = Object.keys(EVM_CHAINS);

/**
 * List of supported Fast networks
 */
export const SUPPORTED_FAST_NETWORKS = Object.keys(FAST_RPC_URLS);
