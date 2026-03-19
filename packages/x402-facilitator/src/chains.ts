/**
 * Chain configurations for x402-facilitator
 *
 * Config loading priority (first found wins, with merge):
 * 1. Custom path (if provided via initChainConfig)
 * 2. User config: ~/.x402/chains.json
 * 3. Bundled defaults: default-chains.ts
 *
 * User/custom configs merge over bundled defaults.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { defineChain } from "viem";
import {
  arbitrum,
  arbitrumSepolia,
  base,
  mainnet,
  sepolia,
  type Chain,
} from "viem/chains";
import type { EvmChainConfig } from "./types.js";
import {
  DEFAULT_CHAINS_CONFIG,
  type ChainJsonConfig,
  type EvmChainJsonConfig,
  type FastChainJsonConfig,
} from "./default-chains.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PartialEvmChainJsonConfig = Partial<Omit<EvmChainJsonConfig, "usdc">> & {
  usdc?: Partial<EvmChainJsonConfig["usdc"]>;
};

type PartialFastChainJsonConfig = Partial<FastChainJsonConfig>;

interface PartialChainJsonConfig {
  evm?: Record<string, PartialEvmChainJsonConfig>;
  fast?: Record<string, PartialFastChainJsonConfig>;
}

export interface ChainMaps {
  evmChains: Record<string, EvmChainConfig>;
  fastRpcUrls: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Map chainId to viem chain objects
// ---------------------------------------------------------------------------

const VIEM_CHAINS: Record<number, Chain> = {
  421614: arbitrumSepolia,
  42161: arbitrum,
  11155111: sepolia,
  1: mainnet,
  8453: base,
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
function loadJsonConfig(path: string): PartialChainJsonConfig | null {
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

function mergeChainConfig(
  base: ChainJsonConfig,
  override: PartialChainJsonConfig
): ChainJsonConfig {
  const evm: Record<string, EvmChainJsonConfig> = { ...base.evm };
  const fast: Record<string, FastChainJsonConfig> = { ...base.fast };

  for (const [network, chainConfig] of Object.entries(override.evm ?? {})) {
    const existing = evm[network];
    evm[network] = {
      chainId: chainConfig.chainId ?? existing?.chainId ?? 0,
      rpcUrl: chainConfig.rpcUrl ?? existing?.rpcUrl ?? "",
      usdc: {
        address: chainConfig.usdc?.address ?? existing?.usdc.address ?? "",
        name: chainConfig.usdc?.name ?? existing?.usdc.name ?? "",
        version: chainConfig.usdc?.version ?? existing?.usdc.version ?? "",
        decimals: chainConfig.usdc?.decimals ?? existing?.usdc.decimals ?? 0,
      },
    };
  }

  for (const [network, fastConfig] of Object.entries(override.fast ?? {})) {
    fast[network] = {
      rpcUrl: fastConfig.rpcUrl ?? fast[network]?.rpcUrl ?? "",
    };
  }

  return { evm, fast };
}

/**
 * Load and merge chain configs with priority
 */
function loadChainConfig(configPath?: string): ChainJsonConfig {
  // Start with bundled defaults from TypeScript config
  let result: ChainJsonConfig = structuredClone(DEFAULT_CHAINS_CONFIG);

  // Check for user config (~/.x402/chains.json)
  const userConfigPath = join(getX402Dir(), "chains.json");
  const userConfig = loadJsonConfig(userConfigPath);
  if (userConfig) {
    result = mergeChainConfig(result, userConfig);
  }

  // Check for custom config path (highest priority)
  if (configPath) {
    const customConfig = loadJsonConfig(configPath);
    if (customConfig) {
      result = mergeChainConfig(result, customConfig);
    }
  }

  return result;
}

/**
 * Build chain maps from config
 */
function buildChainMaps(config: ChainJsonConfig): ChainMaps {
  const evmChains: Record<string, EvmChainConfig> = {};
  const fastRpcUrls: Record<string, string> = {};

  // Build EVM chains
  for (const [network, chainConfig] of Object.entries(config.evm)) {
    if (
      !chainConfig.chainId ||
      !chainConfig.rpcUrl ||
      !chainConfig.usdc.address ||
      !chainConfig.usdc.name ||
      !chainConfig.usdc.version
    ) {
      console.warn(`Incomplete chain config for network ${network}`);
      continue;
    }

    const viemChain = VIEM_CHAINS[chainConfig.chainId] ?? defineChain({
      id: chainConfig.chainId,
      name: network,
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [chainConfig.rpcUrl],
        },
      },
    });

    evmChains[network] = {
      chain: viemChain,
      rpcUrl: chainConfig.rpcUrl,
      usdcAddress: chainConfig.usdc.address as `0x${string}`,
      usdcName: chainConfig.usdc.name,
      usdcVersion: chainConfig.usdc.version,
    };
  }

  // Build Fast RPC URLs
  for (const [network, fastConfig] of Object.entries(config.fast)) {
    if (!fastConfig.rpcUrl) {
      console.warn(`Incomplete Fast RPC config for network ${network}`);
      continue;
    }

    fastRpcUrls[network] = fastConfig.rpcUrl;
  }

  return { evmChains, fastRpcUrls };
}

function applyChainMaps(chainMaps: ChainMaps): void {
  for (const key of Object.keys(EVM_CHAINS)) delete EVM_CHAINS[key];
  for (const key of Object.keys(FAST_RPC_URLS)) delete FAST_RPC_URLS[key];

  Object.assign(EVM_CHAINS, chainMaps.evmChains);
  Object.assign(FAST_RPC_URLS, chainMaps.fastRpcUrls);
}

export function loadChainMaps(configPath?: string): ChainMaps {
  return buildChainMaps(loadChainConfig(configPath));
}

/**
 * Initialize chain config (call before using EVM_CHAINS/FAST_RPC_URLS)
 */
export function initChainConfig(configPath?: string): void {
  customConfigPath = configPath;
  applyChainMaps(loadChainMaps(configPath));
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

export function getEvmChainConfigFromMaps(chainMaps: ChainMaps, network: string): EvmChainConfig | null {
  return chainMaps.evmChains[network] || null;
}

/**
 * Get Fast RPC URL
 */
export function getFastRpcUrl(network: string): string {
  ensureInit();
  return FAST_RPC_URLS[network] || FAST_RPC_URLS["fast-testnet"];
}

export function getFastRpcUrlFromMaps(chainMaps: ChainMaps, network: string): string {
  return chainMaps.fastRpcUrls[network] || chainMaps.fastRpcUrls["fast-testnet"];
}

/**
 * List of supported EVM networks
 */
export function getSupportedEvmNetworks(): string[] {
  ensureInit();
  return Object.keys(EVM_CHAINS);
}

export function getSupportedEvmNetworksFromMaps(chainMaps: ChainMaps): string[] {
  return Object.keys(chainMaps.evmChains);
}

/**
 * List of supported Fast networks
 */
export function getSupportedFastNetworks(): string[] {
  ensureInit();
  return Object.keys(FAST_RPC_URLS);
}

export function getSupportedFastNetworksFromMaps(chainMaps: ChainMaps): string[] {
  return Object.keys(chainMaps.fastRpcUrls);
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
