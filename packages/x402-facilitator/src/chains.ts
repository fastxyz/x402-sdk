/**
 * Chain configurations for x402-facilitator
 *
 * USDC addresses are imported from allset-sdk where available.
 * EIP-3009 metadata (usdcName, usdcVersion) stays local as it's x402-specific.
 */

import { AllSetProvider } from "@fastxyz/allset-sdk/node";
import {
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  mainnet,
  sepolia,
} from "viem/chains";
import type { Chain } from "viem";
import type { EvmChainConfig } from "./types.js";

/**
 * EIP-3009 metadata for USDC contracts (x402-specific, not in SDKs)
 */
interface Eip3009Metadata {
  chain: Chain;
  usdcName: string;
  usdcVersion: string;
  /** Fallback USDC address for chains not in allset-sdk */
  fallbackUsdcAddress?: string;
  /** Custom RPC URL (env var name) */
  rpcEnvVar?: string;
}

const EIP3009_METADATA: Record<string, Eip3009Metadata> = {
  "arbitrum-sepolia": {
    chain: arbitrumSepolia,
    usdcName: "USD Coin",
    usdcVersion: "2",
  },
  arbitrum: {
    chain: arbitrum,
    usdcName: "USD Coin",
    usdcVersion: "2",
    fallbackUsdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    rpcEnvVar: "ARB_RPC_URL",
  },
  "base-sepolia": {
    chain: baseSepolia,
    usdcName: "USDC",
    usdcVersion: "2",
    fallbackUsdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  base: {
    chain: base,
    usdcName: "USD Coin",
    usdcVersion: "2",
    rpcEnvVar: "BASE_RPC_URL",
  },
  ethereum: {
    chain: mainnet,
    usdcName: "USD Coin",
    usdcVersion: "2",
    fallbackUsdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  "ethereum-sepolia": {
    chain: sepolia,
    usdcName: "USDC",
    usdcVersion: "2",
    rpcEnvVar: "ETH_SEPOLIA_RPC",
  },
};

/**
 * Mainnet chains (use mainnet provider)
 */
const MAINNET_CHAINS = new Set(["base", "arbitrum", "ethereum"]);

/**
 * Build EVM chain configs by combining allset-sdk data with local EIP-3009 metadata
 */
function buildEvmChains(): Record<string, EvmChainConfig> {
  const testnetProvider = new AllSetProvider({ network: "testnet" });
  const mainnetProvider = new AllSetProvider({ network: "mainnet" });
  const chains: Record<string, EvmChainConfig> = {};

  for (const [network, metadata] of Object.entries(EIP3009_METADATA)) {
    // Use appropriate provider based on network
    const provider = MAINNET_CHAINS.has(network) ? mainnetProvider : testnetProvider;
    
    // Try to get USDC address from allset-sdk
    const tokenConfig = provider.getTokenConfig(network, "USDC");
    const usdcAddress =
      tokenConfig?.evmAddress ?? metadata.fallbackUsdcAddress ?? "";

    if (!usdcAddress) {
      console.warn(
        `[x402-facilitator] No USDC address for ${network} in allset-sdk or fallback`
      );
      continue;
    }

    // Get RPC URL from environment variable if specified
    const rpcUrl = metadata.rpcEnvVar ? process.env[metadata.rpcEnvVar] : undefined;

    chains[network] = {
      chain: metadata.chain,
      rpcUrl,
      usdcAddress: usdcAddress as `0x${string}`,
      usdcName: metadata.usdcName,
      usdcVersion: metadata.usdcVersion,
    };
  }

  return chains;
}

/**
 * EVM chain configurations with USDC addresses
 */
export const EVM_CHAINS: Record<string, EvmChainConfig> = buildEvmChains();

/**
 * Fast RPC endpoints
 */
export const FAST_RPC_URLS: Record<string, string> = {
  "fast-testnet": "https://testnet.api.fast.xyz/proxy",
  "fast-mainnet": "https://api.fast.xyz/proxy",
};

/**
 * Convert an x402 Fast network name to the CAIP-2 network id used inside
 * signed Fast transactions.
 */
export function getExpectedFastNetworkId(network: string): string | null {
  switch (network) {
    case "fast-testnet":
      return "fast:testnet";
    case "fast-mainnet":
      return "fast:mainnet";
    default:
      return null;
  }
}

/**
 * Bundled trusted Fast validator committees for the official networks.
 * These values are derived from the Fast deployment committee manifests.
 */
export const FAST_TRUSTED_COMMITTEE_PUBLIC_KEYS: Record<string, string[]> = {
  "fast-testnet": [
    "0xdfa5a82548d58dbfd17c9eb32818c47a5ca2b8f8e7da84942ca7ca0c7e57f98d",
    "0x62f9728b168c443204c5fee22ff21aef3e4d3c422bc01067f14a6e2a1eab4ae0",
    "0x96145c0ca385ced0bfbd2ab28578e0acb774912ff3e8dd166ef326b1178b0a78",
    "0xecf967fc920082df854828574315bb0d6434c1c2f29843b50802964833e6f5a9",
  ],
  "fast-mainnet": [
    "0x2a0f5870993fac2f20999e23e763838a40595c6f3d971f327e264bc5442e598c",
    "0x03473bc3523e0c2b0e259b179251774764782473854317f519e0e16e9d77f680",
    "0xb4d47f3f43906f354410da1ca02c8436a3550855d105b0d29c135b6a27361387",
    "0x08210bb6ae6b46eef95d7815d12d1820c368f5a6e8c76cc4dd3812b67cd54324",
  ],
};

/**
 * Get chain config for a network
 */
export function getEvmChainConfig(network: string): EvmChainConfig | null {
  return EVM_CHAINS[network] || null;
}

/**
 * Get Fast RPC URL
 */
export function getFastRpcUrl(network: string, override?: string): string {
  return override || FAST_RPC_URLS[network] || FAST_RPC_URLS["fast-testnet"];
}

/**
 * List of supported EVM networks
 */
export const SUPPORTED_EVM_NETWORKS = Object.keys(EVM_CHAINS);

/**
 * List of supported Fast networks
 */
export const SUPPORTED_FAST_NETWORKS = Object.keys(FAST_RPC_URLS);
