/**
 * Payment settlement logic
 * Aligned with reference implementation
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Hex,
  parseAbi,
  parseSignature,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  decodeTransactionEnvelope,
  getCertificateHash,
  hashTransaction,
  type FastTransaction,
  type FastTransactionCertificate,
} from "@fastxyz/sdk/core";
import type {
  PaymentPayload,
  PaymentRequirement,
  SettleResponse,
  EvmPayload,
  FastPayload,
  FacilitatorConfig,
} from "./types.js";
import { getNetworkType } from "./types.js";
import { getEvmChainConfig } from "./chains.js";
import { verify } from "./verify.js";

/**
 * USDC ABI for transferWithAuthorization
 */
const USDC_ABI = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
  "function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)",
]);

/**
 * Settle a payment on-chain
 */
export async function settle(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement,
  config: FacilitatorConfig
): Promise<SettleResponse> {
  if (paymentPayload.network === "fast" || paymentRequirement.network === "fast") {
    return {
      success: false,
      errorReason: "invalid_network",
      network: paymentPayload.network,
    };
  }

  const networkType = getNetworkType(paymentPayload.network);

  switch (networkType) {
    case "evm":
      return settleEvmPayment(paymentPayload, paymentRequirement, config);
    case "fast":
      return settleFastPayment(paymentPayload, paymentRequirement);
    default:
      return {
        success: false,
        errorReason: `unsupported_network_type`,
        network: paymentPayload.network,
      };
  }
}

function getFastTransactionId(certificate: FastPayload["transactionCertificate"]): string {
  if (typeof certificate.envelope === "string") {
    try {
      return hashTransaction(
        decodeTransactionEnvelope(certificate.envelope) as FastTransaction
      );
    } catch {
      return certificate.envelope.substring(0, 66);
    }
  }

  if (certificate.envelope && typeof certificate.envelope === "object") {
    try {
      return getCertificateHash(certificate as FastTransactionCertificate);
    } catch {
      return "";
    }
  }

  return "";
}

/**
 * Settle EVM payment by calling transferWithAuthorization
 */
async function settleEvmPayment(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement,
  config: FacilitatorConfig
): Promise<SettleResponse> {
  if (!config.evmPrivateKey) {
    return {
      success: false,
      errorReason: "facilitator_not_configured",
      network: paymentPayload.network,
    };
  }

  const chainConfig = getEvmChainConfig(paymentPayload.network);
  if (!chainConfig) {
    return {
      success: false,
      errorReason: "invalid_network",
      network: paymentPayload.network,
    };
  }

  const payload = paymentPayload.payload as EvmPayload;
  if (!payload?.signature || !payload?.authorization) {
    return {
      success: false,
      errorReason: "invalid_payload",
      network: paymentPayload.network,
    };
  }

  const { authorization, signature } = payload;

  // Re-verify before settling (reference implementation does this)
  const verifyResult = await verify(paymentPayload, paymentRequirement, config);
  if (!verifyResult.isValid) {
    return {
      success: false,
      errorReason: verifyResult.invalidReason || "invalid_payment",
      network: paymentPayload.network,
      payer: authorization.from,
    };
  }

  try {
    // Create wallet client
    const account = privateKeyToAccount(config.evmPrivateKey);
    const walletClient = createWalletClient({
      account,
      chain: chainConfig.chain,
      transport: http(),
    });

    // Create public client for waiting
    const publicClient = createPublicClient({
      chain: chainConfig.chain,
      transport: http(),
    });

    // Check if authorization was already used
    const alreadyUsed = await publicClient.readContract({
      address: chainConfig.usdcAddress,
      abi: USDC_ABI,
      functionName: "authorizationState",
      args: [authorization.from as `0x${string}`, authorization.nonce as `0x${string}`],
    });

    if (alreadyUsed) {
      return {
        success: false,
        errorReason: "authorization_already_used",
        network: paymentPayload.network,
        payer: authorization.from,
      };
    }

    // Parse signature into r, s, v using viem's parseSignature
    const parsedSig = parseSignature(signature as Hex);
    const v = parsedSig.v !== undefined 
      ? Number(parsedSig.v) 
      : (parsedSig.yParity === 0 ? 27 : 28);

    // Call transferWithAuthorization
    const txHash = await walletClient.writeContract({
      address: chainConfig.usdcAddress,
      abi: USDC_ABI,
      functionName: "transferWithAuthorization",
      args: [
        authorization.from as `0x${string}`,
        authorization.to as `0x${string}`,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce as `0x${string}`,
        v,
        parsedSig.r,
        parsedSig.s,
      ],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    if (receipt.status !== "success") {
      return {
        success: false,
        errorReason: "invalid_transaction_state",
        transaction: txHash,
        txHash,
        network: paymentPayload.network,
        payer: authorization.from,
      };
    }

    return {
      success: true,
      transaction: txHash,
      txHash,
      network: paymentPayload.network,
      payer: authorization.from,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      errorReason: `settlement_failed: ${message}`,
      network: paymentPayload.network,
      payer: authorization.from,
    };
  }
}

/**
 * Settle Fast payment (no-op - already on-chain)
 * Fast transactions are settled when the wallet creates the transaction certificate
 */
async function settleFastPayment(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement
): Promise<SettleResponse> {
  const payload = paymentPayload.payload as FastPayload;
  if (!payload?.transactionCertificate) {
    return {
      success: false,
      errorReason: "invalid_payload",
      network: paymentPayload.network,
    };
  }

  // Fast transactions are already settled on-chain
  // The wallet extension handles signing and broadcasting
  // Return success with a transaction identifier based on the certificate
  const transactionId = getFastTransactionId(payload.transactionCertificate);

  return {
    success: true,
    transaction: transactionId,
    network: paymentPayload.network,
    // TODO: Extract payer from transaction envelope
  };
}
