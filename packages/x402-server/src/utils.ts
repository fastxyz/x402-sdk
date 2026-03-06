/**
 * x402-server utilities
 */

import type { NetworkConfig } from "./types.js";

/**
 * Default network configurations
 */
export const NETWORK_CONFIGS: Record<string, NetworkConfig> = {
  // FastSet networks
  "fastset-devnet": {
    asset: "0x1e744900021182b293538bb6685b77df095e351364d550021614ce90c8ab9e0a",
    decimals: 6,
  },
  "fastset-mainnet": {
    asset: "0x1e744900021182b293538bb6685b77df095e351364d550021614ce90c8ab9e0a",
    decimals: 6,
  },
  // EVM networks - USDC addresses
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
  "base-sepolia": {
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    decimals: 6,
    extra: {
      name: "USDC",
      version: "2",
    },
  },
  "base": {
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
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
