/**
 * x402-server utilities
 *
 * Token configs are imported from allset-sdk where available.
 * EIP-3009 metadata (name, version) stays local as it's x402-specific.
 */

import { AllSetProvider } from "@fastxyz/allset-sdk/node";
import type { NetworkConfig } from "./types.js";

/**
 * EIP-3009 metadata for USDC contracts (x402-specific, not in SDKs)
 */
const EIP3009_METADATA: Record<string, { name: string; version: string }> = {
  "arbitrum-sepolia": { name: "USD Coin", version: "2" },
  arbitrum: { name: "USD Coin", version: "2" },
  "base-sepolia": { name: "USDC", version: "2" },
  base: { name: "USD Coin", version: "2" },
  ethereum: { name: "USD Coin", version: "2" },
  "ethereum-sepolia": { name: "USDC", version: "2" },
};

/**
 * Fallback configs for networks not in allset-sdk
 */
const FALLBACK_CONFIGS: Record<string, NetworkConfig> = {
  // Mainnets not yet in allset-sdk
  arbitrum: {
    asset: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    extra: { name: "USD Coin", version: "2" },
  },
  ethereum: {
    asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    extra: { name: "USD Coin", version: "2" },
  },
  // Testnets not in allset-sdk
  "base-sepolia": {
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    decimals: 6,
    extra: { name: "USDC", version: "2" },
  },
};

/**
 * Build network configs by combining allset-sdk data with local EIP-3009 metadata
 */
function buildNetworkConfigs(): Record<string, NetworkConfig> {
  const allset = new AllSetProvider({ network: "testnet" });
  const configs: Record<string, NetworkConfig> = {};

  // Fast networks - get testUSDC token ID from allset-sdk
  const ethereumSepoliaToken = allset.getTokenConfig("ethereum-sepolia", "USDC");
  const baseToken = allset.getTokenConfig("base", "USDC");

  if (ethereumSepoliaToken) {
    // testUSDC for testnet
    configs["fast-testnet"] = {
      asset: `0x${ethereumSepoliaToken.fastTokenId}`,
      decimals: ethereumSepoliaToken.decimals,
    };
  }

  if (baseToken) {
    // fastUSDC for mainnet (Base USDC on Fast)
    configs["fast-mainnet"] = {
      asset: `0x${baseToken.fastTokenId}`,
      decimals: baseToken.decimals,
    };
  }

  // EVM networks from allset-sdk
  const evmNetworks = ["ethereum-sepolia", "arbitrum-sepolia", "base"];
  for (const network of evmNetworks) {
    const tokenConfig = allset.getTokenConfig(network, "USDC");
    const metadata = EIP3009_METADATA[network];
    if (tokenConfig) {
      configs[network] = {
        asset: tokenConfig.evmAddress,
        decimals: tokenConfig.decimals,
        ...(metadata && { extra: { name: metadata.name, version: metadata.version } }),
      };
    }
  }

  // Add fallback configs for networks not in allset-sdk
  for (const [network, config] of Object.entries(FALLBACK_CONFIGS)) {
    if (!configs[network]) {
      configs[network] = config;
    }
  }

  return configs;
}

/**
 * Default network configurations
 */
export const NETWORK_CONFIGS: Record<string, NetworkConfig> = buildNetworkConfigs();

/**
 * Reject deprecated network aliases that no longer map to a valid payment flow.
 */
export function assertSupportedPaymentNetwork(network: string): void {
  if (network === "fast") {
    throw new Error(
      'Unsupported Fast network alias "fast". Use "fast-testnet" or "fast-mainnet".'
    );
  }
}

/**
 * Parse price string to amount in base units
 * Supports formats: "$0.10", "0.1 USDC", "100000" (raw)
 */
export function parsePrice(price: string, decimals: number = 6): string {
  const cleaned = price.replace(/[$,\s]/g, "").replace(/usdc/i, "").trim();

  // Check if it's already a raw integer
  if (/^\d+$/.test(cleaned)) {
    return cleaned;
  }

  // Parse as decimal
  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    throw new Error(`Invalid price format: ${price}`);
  }

  const amount = Math.round(value * Math.pow(10, decimals));
  return amount.toString();
}

/**
 * Get network config, with fallback to generic USDC
 */
export function getNetworkConfig(network: string): NetworkConfig {
  if (network in NETWORK_CONFIGS) {
    return NETWORK_CONFIGS[network];
  }

  // Default to generic USDC config for unknown networks
  return {
    asset: "0x0000000000000000000000000000000000000000",
    decimals: 6,
  };
}

/**
 * Encode payload to base64
 */
export function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Decode base64 payload
 */
export function decodePayload<T>(encoded: string): T {
  return JSON.parse(Buffer.from(encoded, "base64").toString());
}
