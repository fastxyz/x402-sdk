/**
 * x402-facilitator types
 */

import type { Account, Chain, Transport, WalletClient } from "viem";

/**
 * Payment requirement from the server
 */
export interface PaymentRequirement {
  scheme: "exact";
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema?: unknown;
  extra?: {
    name?: string;
    version?: string;
    [key: string]: unknown;
  };
}

/**
 * Decoded X-PAYMENT payload
 */
export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: unknown;
}

/**
 * FastSet transaction certificate payload
 */
export interface FastSetPayload {
  transactionCertificate: {
    envelope: string;
    signatures: Array<{
      committee_member: number;
      signature: string;
    }>;
  };
}

/**
 * EVM EIP-3009 authorization payload
 */
export interface EvmPayload {
  signature: string;
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
  };
}

/**
 * Verify response
 */
export interface VerifyResponse {
  valid: boolean;
  invalidReason?: string;
  payer?: string;
  network?: string;
}

/**
 * Settle response
 */
export interface SettleResponse {
  success: boolean;
  txHash?: string;
  transaction?: string;
  errorMessage?: string;
  network?: string;
  payer?: string;
}

/**
 * Supported payment kind
 */
export interface SupportedPaymentKind {
  x402Version: number;
  scheme: string;
  network: string;
  extra?: Record<string, unknown>;
}

/**
 * Facilitator configuration
 */
export interface FacilitatorConfig {
  /** EVM private key for settling EIP-3009 authorizations */
  evmPrivateKey?: `0x${string}`;
  /** FastSet RPC endpoint */
  fastsetRpcUrl?: string;
  /** Custom chain configs */
  chains?: Record<string, Chain>;
}

/**
 * EVM chain configuration
 */
export interface EvmChainConfig {
  chain: Chain;
  rpcUrl?: string;
  usdcAddress: `0x${string}`;
}

/**
 * Network type
 */
export type NetworkType = "evm" | "fastset" | "svm";

/**
 * Determine network type
 */
export function getNetworkType(network: string): NetworkType {
  if (network.startsWith("fastset-") || network === "fast") {
    return "fastset";
  }
  if (network.startsWith("solana")) {
    return "svm";
  }
  return "evm";
}
