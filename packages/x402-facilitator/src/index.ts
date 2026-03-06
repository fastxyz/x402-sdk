/**
 * x402-facilitator
 * 
 * Verify and settle x402 payments on-chain.
 * 
 * Use this package to:
 * - Verify EIP-3009 signatures (EVM)
 * - Verify FastSet transaction certificates
 * - Settle EVM payments via transferWithAuthorization
 * 
 * @example
 * ```typescript
 * import { verify, settle, createFacilitatorServer } from 'x402-facilitator';
 * import express from 'express';
 * 
 * // Use as a library
 * const result = await verify(paymentPayload, paymentRequirement);
 * 
 * // Or create an Express server
 * const app = express();
 * app.use(express.json());
 * app.use(createFacilitatorServer({ evmPrivateKey: '0x...' }));
 * app.listen(4020);
 * ```
 */

// Types
export type {
  PaymentRequirement,
  PaymentPayload,
  FastSetPayload,
  EvmPayload,
  VerifyResponse,
  SettleResponse,
  SupportedPaymentKind,
  FacilitatorConfig,
  EvmChainConfig,
  NetworkType,
} from "./types.js";

export { getNetworkType } from "./types.js";

// Chains
export {
  EVM_CHAINS,
  FASTSET_RPC_URLS,
  SUPPORTED_EVM_NETWORKS,
  SUPPORTED_FASTSET_NETWORKS,
  getEvmChainConfig,
  getFastSetRpcUrl,
} from "./chains.js";

// Core functions
export { verify } from "./verify.js";
export { settle } from "./settle.js";

// Server
export { createFacilitatorServer, createFacilitatorRoutes } from "./server.js";
