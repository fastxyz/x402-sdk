/**
 * Chain configurations for x402-facilitator
 *
 * Config loading order (later overrides earlier):
 * 1. Bundled defaults: data/chains.json (in package)
 * 2. User config: ~/.x402/chains.json (if exists)
 *
 * Edit ~/.x402/chains.json to override addresses/RPC URLs locally.
 */

import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
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
// Types
// ---------------------------------------------------------------------------

interface EvmChainJsonConfig {
  chainId: number;
  rpcUrl: string;
  usdc: {
    address: string;
    name: string;
    version: string;
    decimals: number;
  };
}

interface FastChainJsonConfig {
  rpcUrl: string;
}

interface ChainJsonConfig {
  evm: Record<string, EvmChainJsonConfig>;
  fast: Record<string, FastChainJsonConfig>;
}

// ---------------------------------------------------------------------------
// Config loading with hierarchy
// ---------------------------------------------------------------------------

/**
 * Get x402 config directory
 */
export function getX402Dir(): string {
  return join(homedir(), ".x402");
}

/**
 * Load and merge chain configs
 */
function loadChainConfig(): ChainJsonConfig {
  // 1. Load bundled defaults
  const bundled: ChainJsonConfig = require("../data/chains.json");

  // 2. Check for user config
  const userConfigPath = join(getX402Dir(), "chains.json");

  if (existsSync(userConfigPath)) {
    try {
      const userConfig: Partial<ChainJsonConfig> = JSON.parse(
        readFileSync(userConfigPath, "utf-8")
      );

      // Merge user config over bundled (deep merge for evm/fast)
      return {
        evm: { ...bundled.evm, ...userConfig.evm },
        fast: { ...bundled.fast, ...userConfig.fast },
      };
    } catch (err) {
      console.warn(`Failed to load user config from ${userConfigPath}:`, err);
    }
  }

  return bundled;
}

const chainsJson = loadChainConfig();

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
// Build EVM_CHAINS from merged config
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
// Fast RPC endpoints from merged config
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
