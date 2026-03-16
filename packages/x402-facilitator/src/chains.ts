/**
 * Chain configurations for x402-facilitator
 *
 * Config loading priority (first found wins, with merge):
 * 1. Custom path (if provided via initChainConfig)
 * 2. User config: ~/.x402/chains.json
 * 3. Bundled defaults: data/chains.json
 *
 * User/custom configs merge over bundled defaults.
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
// Map chainId to viem chain objects
// ---------------------------------------------------------------------------

const VIEM_CHAINS: Record<number, Chain> = {
  421614: arbitrumSepolia,
  42161: arbitrum,
  11155111: sepolia,
  1: mainnet,
};

// ---------------------------------------------------------------------------
// Config state (lazily initialized)
// ---------------------------------------------------------------------------

let configInitialized = false;
let customConfigPath: string | undefined;

export const EVM_CHAINS: Record<string, EvmChainConfig> = {};
export const FAST_RPC_URLS: Record<string, string> = {};

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

/**
 * Get x402 config directory
 */
export function getX402Dir(): string {
  return join(homedir(), ".x402");
}

/**
 * Load JSON config from a file path
 */
function loadJsonConfig(path: string): ChainJsonConfig | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    console.warn(`Failed to load config from ${path}:`, err);
    return null;
  }
}

/**
 * Load and merge chain configs with priority
 */
function loadChainConfig(): ChainJsonConfig {
  // Start with bundled defaults
  const bundled: ChainJsonConfig = require("../data/chains.json");
  let result = { ...bundled };

  // Check for user config (~/.x402/chains.json)
  const userConfigPath = join(getX402Dir(), "chains.json");
  const userConfig = loadJsonConfig(userConfigPath);
  if (userConfig) {
    result = {
      evm: { ...result.evm, ...userConfig.evm },
      fast: { ...result.fast, ...userConfig.fast },
    };
  }

  // Check for custom config path (highest priority)
  if (customConfigPath) {
    const customConfig = loadJsonConfig(customConfigPath);
    if (customConfig) {
      result = {
        evm: { ...result.evm, ...customConfig.evm },
        fast: { ...result.fast, ...customConfig.fast },
      };
    }
  }

  return result;
}

/**
 * Build chain maps from config
 */
function buildChainMaps(config: ChainJsonConfig): void {
  // Clear existing
  for (const key of Object.keys(EVM_CHAINS)) delete EVM_CHAINS[key];
  for (const key of Object.keys(FAST_RPC_URLS)) delete FAST_RPC_URLS[key];

  // Build EVM chains
  for (const [network, chainConfig] of Object.entries(config.evm)) {
    const viemChain = VIEM_CHAINS[chainConfig.chainId];
    if (!viemChain) {
      console.warn(`Unknown chainId ${chainConfig.chainId} for network ${network}`);
      continue;
    }

    EVM_CHAINS[network] = {
      chain: viemChain,
      rpcUrl: chainConfig.rpcUrl,
      usdcAddress: chainConfig.usdc.address as `0x${string}`,
      usdcName: chainConfig.usdc.name,
      usdcVersion: chainConfig.usdc.version,
    };
  }

  // Build Fast RPC URLs
  for (const [network, fastConfig] of Object.entries(config.fast)) {
    FAST_RPC_URLS[network] = fastConfig.rpcUrl;
  }
}

/**
 * Initialize chain config (call before using EVM_CHAINS/FAST_RPC_URLS)
 */
export function initChainConfig(configPath?: string): void {
  customConfigPath = configPath;
  const config = loadChainConfig();
  buildChainMaps(config);
  configInitialized = true;
}

/**
 * Ensure config is initialized (lazy init with defaults)
 */
function ensureInit(): void {
  if (!configInitialized) {
    initChainConfig();
  }
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Get chain config for a network
 */
export function getEvmChainConfig(network: string): EvmChainConfig | null {
  ensureInit();
  return EVM_CHAINS[network] || null;
}

/**
 * Get Fast RPC URL
 */
export function getFastRpcUrl(network: string): string {
  ensureInit();
  return FAST_RPC_URLS[network] || FAST_RPC_URLS["fast-testnet"];
}

/**
 * List of supported EVM networks
 */
export function getSupportedEvmNetworks(): string[] {
  ensureInit();
  return Object.keys(EVM_CHAINS);
}

/**
 * List of supported Fast networks
 */
export function getSupportedFastNetworks(): string[] {
  ensureInit();
  return Object.keys(FAST_RPC_URLS);
}

// Legacy exports (for backwards compatibility)
export const SUPPORTED_EVM_NETWORKS = new Proxy([] as string[], {
  get(_, prop) {
    ensureInit();
    const networks = Object.keys(EVM_CHAINS);
    if (prop === "length") return networks.length;
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return networks[Number(prop)];
    }
    if (prop === Symbol.iterator) {
      return networks[Symbol.iterator].bind(networks);
    }
    return (networks as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const SUPPORTED_FAST_NETWORKS = new Proxy([] as string[], {
  get(_, prop) {
    ensureInit();
    const networks = Object.keys(FAST_RPC_URLS);
    if (prop === "length") return networks.length;
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return networks[Number(prop)];
    }
    if (prop === Symbol.iterator) {
      return networks[Symbol.iterator].bind(networks);
    }
    return (networks as unknown as Record<string | symbol, unknown>)[prop];
  },
});
