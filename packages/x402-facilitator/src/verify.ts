/**
 * Payment verification logic
 * Aligned with reference implementation
 */

import {
  createPublicClient,
  http,
  type Address,
  type Hex,
  parseAbi,
} from "viem";
import type {
  PaymentPayload,
  PaymentRequirement,
  VerifyResponse,
  EvmPayload,
  FastPayload,
} from "./types.js";
import { getNetworkType, getNetworkId } from "./types.js";
import { getEvmChainConfig } from "./chains.js";
import { decodeEnvelope, getTransferDetails, bytesToHex } from "./fast-bcs.js";

/**
 * USDC ABI for balance check
 */
const ERC20_ABI = parseAbi([
  "function balanceOf(address account) external view returns (uint256)",
]);

/**
 * EIP-3009 authorization types for typed data verification
 */
const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * Verify a payment
 */
export async function verify(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement
): Promise<VerifyResponse> {
  const networkType = getNetworkType(paymentPayload.network);

  switch (networkType) {
    case "evm":
      return verifyEvmPayment(paymentPayload, paymentRequirement);
    case "fast":
      return verifyFastPayment(paymentPayload, paymentRequirement);
    default:
      return {
        isValid: false,
        invalidReason: `unsupported_network_type`,
        network: paymentPayload.network,
      };
  }
}

/**
 * Verify EVM EIP-3009 payment
 * Uses viem's verifyTypedData for signature verification
 */
async function verifyEvmPayment(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement
): Promise<VerifyResponse> {
  const chainConfig = getEvmChainConfig(paymentPayload.network);
  if (!chainConfig) {
    return {
      isValid: false,
      invalidReason: `invalid_network`,
      network: paymentPayload.network,
    };
  }

  const payload = paymentPayload.payload as EvmPayload;
  if (!payload?.signature || !payload?.authorization) {
    return {
      isValid: false,
      invalidReason: "invalid_payload",
      network: paymentPayload.network,
    };
  }

  const { authorization, signature } = payload;

  // Verify scheme matches
  if (paymentPayload.scheme !== "exact" || paymentRequirement.scheme !== "exact") {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
      payer: authorization.from,
      network: paymentPayload.network,
    };
  }

  // Verify network matches
  if (paymentPayload.network !== paymentRequirement.network) {
    return {
      isValid: false,
      invalidReason: "invalid_network",
      payer: authorization.from,
      network: paymentPayload.network,
    };
  }

  // Verify payment recipient matches
  if (authorization.to.toLowerCase() !== paymentRequirement.payTo.toLowerCase()) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_recipient_mismatch",
      payer: authorization.from,
      network: paymentPayload.network,
    };
  }

  // Get domain parameters
  const chainId = getNetworkId(paymentPayload.network);
  const name = paymentRequirement.extra?.name ?? chainConfig.usdcName ?? "USD Coin";
  const version = paymentRequirement.extra?.version ?? chainConfig.usdcVersion ?? "2";
  const erc20Address = paymentRequirement.asset as Address;

  // Create public client for verification
  const client = createPublicClient({
    chain: chainConfig.chain,
    transport: http(),
  });

  // Verify signature using viem's verifyTypedData
  try {
    const isValidSignature = await client.verifyTypedData({
      address: authorization.from as Address,
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization",
      domain: {
        name,
        version,
        chainId,
        verifyingContract: erc20Address,
      },
      message: {
        from: authorization.from as Address,
        to: authorization.to as Address,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce as Hex,
      },
      signature: signature as Hex,
    });

    if (!isValidSignature) {
      return {
        isValid: false,
        invalidReason: "invalid_exact_evm_payload_signature",
        payer: authorization.from,
        network: paymentPayload.network,
      };
    }
  } catch (error) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_signature",
      payer: authorization.from,
      network: paymentPayload.network,
    };
  }

  // Verify timing - validBefore must be sufficiently in the future (pad 6 seconds for 3 blocks)
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(authorization.validBefore) < BigInt(now + 6)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_before",
      payer: authorization.from,
      network: paymentPayload.network,
    };
  }

  // Verify timing - validAfter must be in the past
  if (BigInt(authorization.validAfter) > BigInt(now)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_after",
      payer: authorization.from,
      network: paymentPayload.network,
    };
  }

  // Verify value meets requirement
  if (BigInt(authorization.value) < BigInt(paymentRequirement.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_value",
      payer: authorization.from,
      network: paymentPayload.network,
    };
  }

  // Check on-chain balance
  try {
    const balance = await client.readContract({
      address: erc20Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [authorization.from as Address],
    });

    if (balance < BigInt(paymentRequirement.maxAmountRequired)) {
      return {
        isValid: false,
        invalidReason: "insufficient_funds",
        payer: authorization.from,
        network: paymentPayload.network,
      };
    }
  } catch (error) {
    return {
      isValid: false,
      invalidReason: "balance_check_failed",
      payer: authorization.from,
      network: paymentPayload.network,
    };
  }

  return {
    isValid: true,
    payer: authorization.from,
    network: paymentPayload.network,
  };
}

/**
 * Normalize address for comparison
 * Handles both hex (0x...) and bech32m (set1...) formats
 */
function normalizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/^0x/, "");
}

/**
 * Compare two addresses for equality
 * Supports hex pubkeys and bech32m addresses
 */
function addressesMatch(a: string, b: string): boolean {
  // If both start with "set1", compare directly
  if (a.startsWith("set1") && b.startsWith("set1")) {
    return a.toLowerCase() === b.toLowerCase();
  }
  
  // If both are hex, compare normalized
  if ((a.startsWith("0x") || /^[0-9a-fA-F]+$/.test(a)) &&
      (b.startsWith("0x") || /^[0-9a-fA-F]+$/.test(b))) {
    return normalizeAddress(a) === normalizeAddress(b);
  }
  
  // Mixed format - try to extract the hex portion from bech32m
  // set1 addresses encode the 32-byte pubkey, so we compare the hex representation
  // For simplicity, if formats don't match, return false
  // In production, would decode bech32m to get the pubkey bytes
  return false;
}

/**
 * Verify Fast payment by decoding the transaction certificate
 * 
 * Verifies:
 * 1. Certificate structure (envelope + signatures)
 * 2. Decode envelope to extract transaction details
 * 3. Verify recipient matches payTo
 * 4. Verify amount >= maxAmountRequired
 * 5. Verify token matches asset
 */
async function verifyFastPayment(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement
): Promise<VerifyResponse> {
  // Verify scheme matches
  if (paymentPayload.scheme !== "exact" || paymentRequirement.scheme !== "exact") {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
      network: paymentPayload.network,
    };
  }

  // Verify network matches
  if (paymentPayload.network !== paymentRequirement.network) {
    return {
      isValid: false,
      invalidReason: "invalid_network",
      network: paymentPayload.network,
    };
  }

  const payload = paymentPayload.payload as FastPayload;
  if (!payload?.transactionCertificate) {
    return {
      isValid: false,
      invalidReason: "invalid_payload",
      network: paymentPayload.network,
    };
  }

  const { envelope, signatures } = payload.transactionCertificate;

  // Validate certificate structure
  if (!envelope) {
    return {
      isValid: false,
      invalidReason: "missing_envelope",
      network: paymentPayload.network,
    };
  }

  if (!signatures || signatures.length === 0) {
    return {
      isValid: false,
      invalidReason: "missing_signatures",
      network: paymentPayload.network,
    };
  }

  // Minimum signature threshold (2f+1 for BFT, typically 3+ for testnets)
  // Fast devnet has a small committee, so we check for at least 1
  // In production, this should be configurable based on network
  const minSignatures = paymentPayload.network === "fast-devnet" ? 1 : 3;
  if (signatures.length < minSignatures) {
    return {
      isValid: false,
      invalidReason: `insufficient_signatures: need ${minSignatures}, got ${signatures.length}`,
      network: paymentPayload.network,
    };
  }

  // Decode the envelope to extract transaction details
  let decodedTx;
  try {
    decodedTx = decodeEnvelope(envelope);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      isValid: false,
      invalidReason: `envelope_decode_failed: ${msg}`,
      network: paymentPayload.network,
    };
  }

  // Extract transfer details
  const transfer = getTransferDetails(decodedTx);
  if (!transfer) {
    return {
      isValid: false,
      invalidReason: "not_a_token_transfer",
      network: paymentPayload.network,
    };
  }

  // Verify recipient matches payTo
  if (!addressesMatch(transfer.recipient, paymentRequirement.payTo)) {
    return {
      isValid: false,
      invalidReason: `recipient_mismatch: expected ${paymentRequirement.payTo}, got ${transfer.recipient}`,
      payer: transfer.sender,
      network: paymentPayload.network,
    };
  }

  // Verify amount >= maxAmountRequired
  // Fast uses 18 decimals for SETUSDC, payment requirement uses 6 decimals
  // Need to normalize: requirement amount * 10^12 = Fast amount
  const requiredAmount = BigInt(paymentRequirement.maxAmountRequired);
  const fastDecimals = 18;
  const requirementDecimals = 6; // USDC standard
  const decimalDiff = fastDecimals - requirementDecimals;
  const normalizedRequired = requiredAmount * BigInt(10 ** decimalDiff);

  if (transfer.amount < normalizedRequired) {
    return {
      isValid: false,
      invalidReason: `insufficient_amount: required ${normalizedRequired.toString()}, got ${transfer.amount.toString()}`,
      payer: transfer.sender,
      network: paymentPayload.network,
    };
  }

  // Verify token matches asset (if asset is specified)
  if (paymentRequirement.asset) {
    const normalizedAsset = normalizeAddress(paymentRequirement.asset);
    const normalizedTokenId = normalizeAddress(transfer.tokenId);
    
    if (normalizedAsset !== normalizedTokenId) {
      return {
        isValid: false,
        invalidReason: `token_mismatch: expected ${paymentRequirement.asset}, got ${transfer.tokenId}`,
        payer: transfer.sender,
        network: paymentPayload.network,
      };
    }
  }

  // TODO: Verify committee signatures cryptographically
  // This would require:
  // 1. Knowing the committee public keys for the network
  // 2. Verifying each signature against the envelope hash
  // For now, we trust the certificate structure + signature count

  // TODO: Query Fast RPC to verify transaction exists on-chain
  // This would add an extra layer of verification but adds latency

  return {
    isValid: true,
    payer: transfer.sender,
    network: paymentPayload.network,
  };
}
