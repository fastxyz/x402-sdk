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
import type { EvmChainConfig } from "./types.js";

/**
 * EVM chain configurations with USDC addresses
 */
export const EVM_CHAINS: Record<string, EvmChainConfig> = {
  "arbitrum-sepolia": {
    chain: arbitrumSepolia,
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    usdcName: "USD Coin",
    usdcVersion: "2",
  },
  arbitrum: {
    chain: arbitrum,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcName: "USD Coin",
    usdcVersion: "2",
  },
  "base-sepolia": {
    chain: baseSepolia,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdcName: "USDC",
    usdcVersion: "2",
  },
  base: {
    chain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcName: "USD Coin",
    usdcVersion: "2",
  },
  ethereum: {
    chain: mainnet,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcName: "USD Coin",
    usdcVersion: "2",
  },
  "ethereum-sepolia": {
    chain: sepolia,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    usdcName: "USD Coin",
    usdcVersion: "2",
  },
};

/**
 * Fast RPC endpoints
 */
export const FAST_RPC_URLS: Record<string, string> = {
  "fast-testnet": "https://api.fast.xyz/proxy",
  "fast-mainnet": "https://api.fast.xyz/proxy",
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
