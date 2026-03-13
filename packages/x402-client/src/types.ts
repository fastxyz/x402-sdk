/**
 * x402 Client Types
 */

import type { FastWallet as FastWalletClass } from '@fastxyz/sdk';
import type { EvmWallet as AllSetEvmWallet } from '@fastxyz/allset-sdk';

// ─── Payment Types ────────────────────────────────────────────────────────────

/**
 * Payment requirement from 402 response
 */
export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset?: string;
  extra?: {
    name?: string;
    version?: string;
    [key: string]: unknown;
  };
}

/**
 * Parsed 402 response
 */
export interface PaymentRequired {
  x402Version?: number;
  accepts?: PaymentRequirement[];
}

// ─── Wallet Types ─────────────────────────────────────────────────────────────

/**
 * Simple Fast wallet configuration (legacy format)
 * 
 * Use this when you have raw keys and don't want to create a FastWallet instance.
 */
export interface FastWalletConfig {
  type: 'fast';
  privateKey: string;  // Hex-encoded Ed25519 private key (no 0x prefix)
  publicKey: string;   // Hex-encoded Ed25519 public key
  address: string;     // bech32m address (fast1...)
  rpcUrl?: string;     // Fast RPC endpoint (optional, uses default)
}

/**
 * Simple EVM wallet configuration (legacy format)
 * 
 * Use this when you have raw keys and don't want to use allset-sdk's wallet.
 */
export interface EvmWalletConfig {
  type: 'evm';
  privateKey: `0x${string}`;  // Hex-encoded secp256k1 private key
  address: `0x${string}`;     // Ethereum address
}

/**
 * Fast wallet - accepts either:
 * - FastWallet class from @fastxyz/sdk (recommended)
 * - Simple config object with type: 'fast' (legacy)
 */
export type FastWallet = FastWalletClass | FastWalletConfig;

/**
 * EVM wallet - accepts either:
 * - EvmWallet from @fastxyz/allset-sdk
 * - Simple config object with type: 'evm' (legacy)
 */
export type EvmWallet = AllSetEvmWallet | EvmWalletConfig;

/**
 * Combined wallet type - any supported wallet format
 */
export type Wallet = FastWallet | EvmWallet;

// ─── Type Guards ──────────────────────────────────────────────────────────────

/**
 * Check if wallet is a FastWallet class instance from @fastxyz/sdk
 */
export function isFastWalletClass(wallet: unknown): wallet is FastWalletClass {
  return (
    wallet !== null &&
    typeof wallet === 'object' &&
    'submit' in wallet &&
    typeof (wallet as FastWalletClass).submit === 'function'
  );
}

/**
 * Check if wallet is a simple Fast wallet config
 */
export function isFastWalletConfig(wallet: unknown): wallet is FastWalletConfig {
  return (
    wallet !== null &&
    typeof wallet === 'object' &&
    (wallet as FastWalletConfig).type === 'fast' &&
    typeof (wallet as FastWalletConfig).privateKey === 'string'
  );
}

/**
 * Check if wallet is any type of Fast wallet
 */
export function isFastWallet(wallet: unknown): wallet is FastWallet {
  return isFastWalletClass(wallet) || isFastWalletConfig(wallet);
}

/**
 * Check if wallet is an EVM wallet (either format)
 */
export function isEvmWallet(wallet: unknown): wallet is EvmWallet {
  if (wallet === null || typeof wallet !== 'object') return false;
  const w = wallet as Record<string, unknown>;
  
  // Check for legacy config format
  if (w.type === 'evm') return true;
  
  // Check for allset-sdk format (has privateKey starting with 0x, no type field)
  if (
    typeof w.privateKey === 'string' &&
    w.privateKey.startsWith('0x') &&
    typeof w.address === 'string' &&
    w.address.startsWith('0x') &&
    !('type' in w)
  ) {
    return true;
  }
  
  return false;
}

// ─── API Types ────────────────────────────────────────────────────────────────

/**
 * x402Pay parameters
 */
export interface X402PayParams {
  /** URL of the x402-protected resource */
  url: string;
  /** HTTP method (default: GET) */
  method?: string;
  /** Custom headers to include in the request */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT) */
  body?: string;
  /** Wallet(s) to use for payment */
  wallet: Wallet | Wallet[];
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Payment details in response
 */
export interface PaymentDetails {
  network: string;
  amount: string;
  recipient: string;
  txHash: string;
  bridged?: boolean;
  bridgeTxHash?: string;
}

/**
 * x402Pay response
 */
export interface X402PayResult {
  /** Whether the request succeeded after payment */
  success: boolean;
  /** HTTP status code of final response */
  statusCode: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body */
  body: unknown;
  /** Payment details (if payment was made) */
  payment?: PaymentDetails;
  /** Human-readable note */
  note: string;
  /** Debug logs (if verbose: true) */
  logs?: string[];
}

// ─── EIP-3009 Types ───────────────────────────────────────────────────────────

/**
 * EIP-3009 authorization parameters
 */
export interface Eip3009Authorization {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: `0x${string}`;
}

/**
 * x402 payment payload for Fast
 */
export interface FastPaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    type: 'signAndSendTransaction';
    transactionCertificate: unknown;
  };
}

/**
 * x402 payment payload for EVM (EIP-3009)
 */
export interface EvmPaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: Eip3009Authorization;
  };
}
