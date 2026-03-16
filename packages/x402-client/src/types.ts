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
 * Fast wallet from @fastxyz/sdk
 */
export type FastWallet = FastWalletClass;

/**
 * EVM wallet from @fastxyz/allset-sdk
 * 
 * Create with: `createEvmWallet()` from @fastxyz/allset-sdk
 */
export type EvmWallet = AllSetEvmWallet;

/**
 * Combined wallet type
 */
export type Wallet = FastWallet | EvmWallet;

// ─── Type Guards ──────────────────────────────────────────────────────────────

/**
 * Check if wallet is a FastWallet from @fastxyz/sdk
 */
export function isFastWallet(wallet: unknown): wallet is FastWallet {
  return (
    wallet !== null &&
    typeof wallet === 'object' &&
    'submit' in wallet &&
    typeof (wallet as FastWallet).submit === 'function'
  );
}

/**
 * Check if wallet is an EvmWallet from @fastxyz/allset-sdk
 */
export function isEvmWallet(wallet: unknown): wallet is EvmWallet {
  if (wallet === null || typeof wallet !== 'object') return false;
  const w = wallet as Record<string, unknown>;
  
  // EvmWallet has privateKey (0x...) and address (0x...), no 'submit' method
  return (
    typeof w.privateKey === 'string' &&
    w.privateKey.startsWith('0x') &&
    typeof w.address === 'string' &&
    w.address.startsWith('0x') &&
    !('submit' in w)
  );
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
