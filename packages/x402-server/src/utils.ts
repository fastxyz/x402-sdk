/**
 * x402-server utilities
 *
 * Config loading priority (first found wins, with merge):
 * 1. Custom path (if provided via initNetworkConfig)
 * 2. User config: ~/.x402/networks.json
 * 3. Bundled defaults: data/networks.json
 */

import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { NetworkConfig } from "./types.js";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Config state
// ---------------------------------------------------------------------------

let configInitialized = false;
let customConfigPath: string | undefined;
let NETWORK_CONFIGS: Record<string, NetworkConfig> = {};

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
function loadJsonConfig(path: string): Record<string, NetworkConfig> | null {
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
 * Load and merge network configs with priority
 */
function loadNetworkConfig(): Record<string, NetworkConfig> {
  // Start with bundled defaults
  const bundled: Record<string, NetworkConfig> = require("../data/networks.json");
  let result = { ...bundled };

  // Check for user config (~/.x402/networks.json)
  const userConfigPath = join(getX402Dir(), "networks.json");
  const userConfig = loadJsonConfig(userConfigPath);
  if (userConfig) {
    result = { ...result, ...userConfig };
  }

  // Check for custom config path (highest priority)
  if (customConfigPath) {
    const customConfig = loadJsonConfig(customConfigPath);
    if (customConfig) {
      result = { ...result, ...customConfig };
    }
  }

  return result;
}

/**
 * Initialize network config (call before using getNetworkConfig)
 */
export function initNetworkConfig(configPath?: string): void {
  customConfigPath = configPath;
  NETWORK_CONFIGS = loadNetworkConfig();
  configInitialized = true;
}

/**
 * Ensure config is initialized (lazy init with defaults)
 */
function ensureInit(): void {
  if (!configInitialized) {
    initNetworkConfig();
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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
  ensureInit();

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
 * Get all supported networks
 */
export function getSupportedNetworks(): string[] {
  ensureInit();
  return Object.keys(NETWORK_CONFIGS);
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
