/**
 * Chain configurations for x402-facilitator
 */

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
 * EVM chain configurations with USDC addresses
 */
export const EVM_CHAINS: Record<string, EvmChainConfig> = {
  "arbitrum-sepolia": {
    chain: arbitrumSepolia,
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
  arbitrum: {
    chain: arbitrum,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  "base-sepolia": {
    chain: baseSepolia,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  base: {
    chain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  ethereum: {
    chain: mainnet,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  "ethereum-sepolia": {
    chain: sepolia,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
};

/**
 * FastSet RPC endpoints
 */
export const FASTSET_RPC_URLS: Record<string, string> = {
  "fastset-devnet": "https://api.fast.xyz/proxy",
  "fastset-mainnet": "https://api.fast.xyz/proxy",
};

/**
 * Get chain config for a network
 */
export function getEvmChainConfig(network: string): EvmChainConfig | null {
  return EVM_CHAINS[network] || null;
}

/**
 * Get FastSet RPC URL
 */
export function getFastSetRpcUrl(network: string): string {
  return FASTSET_RPC_URLS[network] || FASTSET_RPC_URLS["fastset-devnet"];
}

/**
 * List of supported EVM networks
 */
export const SUPPORTED_EVM_NETWORKS = Object.keys(EVM_CHAINS);

/**
 * List of supported FastSet networks
 */
export const SUPPORTED_FASTSET_NETWORKS = Object.keys(FASTSET_RPC_URLS);
