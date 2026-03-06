/**
 * Payment settlement logic
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Hex,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type {
  PaymentPayload,
  PaymentRequirement,
  SettleResponse,
  EvmPayload,
  FastSetPayload,
  FacilitatorConfig,
} from "./types.js";
import { getNetworkType } from "./types.js";
import { getEvmChainConfig } from "./chains.js";

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
  const networkType = getNetworkType(paymentPayload.network);

  switch (networkType) {
    case "evm":
      return settleEvmPayment(paymentPayload, paymentRequirement, config);
    case "fastset":
      return settleFastSetPayment(paymentPayload, paymentRequirement);
    default:
      return {
        success: false,
        errorMessage: `Unsupported network type: ${networkType}`,
        network: paymentPayload.network,
      };
  }
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
      errorMessage: "EVM private key not configured",
      network: paymentPayload.network,
    };
  }

  const chainConfig = getEvmChainConfig(paymentPayload.network);
  if (!chainConfig) {
    return {
      success: false,
      errorMessage: `Unknown EVM network: ${paymentPayload.network}`,
      network: paymentPayload.network,
    };
  }

  const payload = paymentPayload.payload as EvmPayload;
  if (!payload?.signature || !payload?.authorization) {
    return {
      success: false,
      errorMessage: "Missing signature or authorization in payload",
      network: paymentPayload.network,
    };
  }

  const { authorization, signature } = payload;

  try {
    // Parse signature into v, r, s
    const sig = signature as Hex;
    const r = `0x${sig.slice(2, 66)}` as Hex;
    const s = `0x${sig.slice(66, 130)}` as Hex;
    let v = parseInt(sig.slice(130, 132), 16);
    
    // Normalize v (EIP-155)
    if (v < 27) {
      v += 27;
    }

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
        errorMessage: "Authorization nonce already used",
        network: paymentPayload.network,
        payer: authorization.from,
      };
    }

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
        r,
        s,
      ],
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    });

    if (receipt.status === "reverted") {
      return {
        success: false,
        errorMessage: "Transaction reverted",
        txHash,
        transaction: txHash,
        network: paymentPayload.network,
        payer: authorization.from,
      };
    }

    return {
      success: true,
      txHash,
      transaction: txHash,
      network: paymentPayload.network,
      payer: authorization.from,
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: `Settlement failed: ${error}`,
      network: paymentPayload.network,
      payer: payload.authorization.from,
    };
  }
}

/**
 * Settle FastSet payment (no-op - already on-chain)
 */
async function settleFastSetPayment(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement
): Promise<SettleResponse> {
  // FastSet transactions are already settled when we receive the certificate
  // The certificate proves consensus was reached and the transaction is on-chain
  
  const payload = paymentPayload.payload as FastSetPayload;
  if (!payload?.transactionCertificate) {
    return {
      success: false,
      errorMessage: "Missing transactionCertificate in payload",
      network: paymentPayload.network,
    };
  }

  return {
    success: true,
    network: paymentPayload.network,
    // Could extract txHash from envelope if needed
  };
}
