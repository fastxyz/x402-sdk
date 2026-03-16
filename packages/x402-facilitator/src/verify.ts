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
import { getNetworkType } from "./types.js";
import { type ChainMaps, getEvmChainConfig, getEvmChainConfigFromMaps } from "./chains.js";
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
  return verifyInternal(paymentPayload, paymentRequirement);
}

export async function verifyWithChainMaps(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement,
  chainMaps: ChainMaps
): Promise<VerifyResponse> {
  return verifyInternal(paymentPayload, paymentRequirement, chainMaps);
}

async function verifyInternal(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement,
  chainMaps?: ChainMaps
): Promise<VerifyResponse> {
  const networkType = getNetworkType(paymentPayload.network);

  switch (networkType) {
    case "evm":
      return verifyEvmPayment(paymentPayload, paymentRequirement, chainMaps);
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
  paymentRequirement: PaymentRequirement,
  chainMaps?: ChainMaps
): Promise<VerifyResponse> {
  const chainConfig = chainMaps
    ? getEvmChainConfigFromMaps(chainMaps, paymentPayload.network)
    : getEvmChainConfig(paymentPayload.network);
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
  const chainId = chainConfig.chain.id;
  const name = paymentRequirement.extra?.name ?? chainConfig.usdcName ?? "USD Coin";
  const version = paymentRequirement.extra?.version ?? chainConfig.usdcVersion ?? "2";
  const erc20Address = paymentRequirement.asset as Address;

  // Create public client for verification
  const client = createPublicClient({
    chain: chainConfig.chain,
    transport: http(chainConfig.rpcUrl),
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
 * Supports hex pubkeys and bech32m addresses (fast1... or set1...)
 */
function addressesMatch(a: string, b: string): boolean {
  // Helper to decode bech32m to hex
  const bech32mToHex = (addr: string): string | null => {
    try {
      // Import bech32m dynamically would be better but for sync use:
      // Simple implementation: extract the data part and decode
      const sep = addr.indexOf("1");
      if (sep === -1) return null;
      
      const data = addr.slice(sep + 1);
      const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
      
      // Decode each character to 5-bit value
      const values: number[] = [];
      for (const c of data) {
        const idx = CHARSET.indexOf(c.toLowerCase());
        if (idx === -1) return null;
        values.push(idx);
      }
      
      // Remove checksum (last 6 characters)
      const dataValues = values.slice(0, -6);
      
      // Convert 5-bit to 8-bit
      let acc = 0;
      let bits = 0;
      const result: number[] = [];
      for (const v of dataValues) {
        acc = (acc << 5) | v;
        bits += 5;
        while (bits >= 8) {
          bits -= 8;
          result.push((acc >> bits) & 0xff);
        }
      }
      
      return Buffer.from(result).toString("hex");
    } catch {
      return null;
    }
  };

  // If both start with "fast1" or "set1", compare directly
  if ((a.startsWith("fast1") || a.startsWith("set1")) && 
      (b.startsWith("fast1") || b.startsWith("set1"))) {
    return a.toLowerCase() === b.toLowerCase();
  }
  
  // If both are hex, compare normalized
  if ((a.startsWith("0x") || /^[0-9a-fA-F]+$/.test(a)) &&
      (b.startsWith("0x") || /^[0-9a-fA-F]+$/.test(b))) {
    return normalizeAddress(a) === normalizeAddress(b);
  }
  
  // Mixed format - decode bech32m to hex and compare
  let hexA = a;
  let hexB = b;
  
  if (a.startsWith("fast1") || a.startsWith("set1")) {
    const decoded = bech32mToHex(a);
    if (!decoded) return false;
    hexA = decoded;
  } else {
    hexA = normalizeAddress(a);
  }
  
  if (b.startsWith("fast1") || b.startsWith("set1")) {
    const decoded = bech32mToHex(b);
    if (!decoded) return false;
    hexB = decoded;
  } else {
    hexB = normalizeAddress(b);
  }
  
  return hexA.toLowerCase() === hexB.toLowerCase();
}

/**
 * Fast transaction certificate structure (from RPC)
 */
interface FastTransactionCertificate {
  envelope: {
    transaction: {
      sender: number[];
      recipient: number[];
      nonce: number;
      timestamp_nanos: number;
      claim: {
        TokenTransfer?: {
          token_id: number[];
          amount: string;
          user_data: number[] | null;
        };
      };
      archival?: boolean;
    };
    signature: {
      Signature: number[];
    };
  };
  signatures: Array<[number[], number[]]>;
}

// Fast RPC object envelopes encode amounts as hex strings without a 0x prefix.
function parseFastRpcAmount(amount: string): bigint {
  const normalized = amount.startsWith("0x") ? amount : `0x${amount}`;
  return BigInt(normalized);
}

/**
 * Verify Fast payment by validating the transaction certificate
 * 
 * Verifies:
 * 1. Certificate structure (envelope + signatures)
 * 2. Extract transaction details from envelope
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

  const certificate = payload.transactionCertificate;
  
  // Handle both formats:
  // 1. BCS serialized: { envelope: "0x...", signatures: [...] }
  // 2. Object format: { envelope: { transaction: {...} }, signatures: [...] }
  const { envelope, signatures } = certificate as { 
    envelope: string | { transaction: FastTransactionCertificate["envelope"]["transaction"] };
    signatures: unknown[];
  };

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
  // Fast testnet has a small committee, so we check for at least 1
  // In production, this should be configurable based on network
  const minSignatures = paymentPayload.network === "fast-testnet" ? 1 : 3;
  if (signatures.length < minSignatures) {
    return {
      isValid: false,
      invalidReason: `insufficient_signatures: need ${minSignatures}, got ${signatures.length}`,
      network: paymentPayload.network,
    };
  }

  // Decode envelope if it's a BCS-serialized string
  let senderHex: string;
  let recipientHex: string;
  let tokenIdHex: string;
  let amountBigInt: bigint;

  if (typeof envelope === "string") {
    // BCS serialized format - decode using decodeEnvelope
    try {
      const decoded = decodeEnvelope(envelope);
      const transferDetails = getTransferDetails(decoded);
      
      if (!transferDetails) {
        return {
          isValid: false,
          invalidReason: "not_a_token_transfer",
          network: paymentPayload.network,
        };
      }
      
      // getTransferDetails already returns 0x-prefixed addresses and a bigint amount.
      senderHex = transferDetails.sender.startsWith("0x") ? transferDetails.sender : "0x" + transferDetails.sender;
      recipientHex = transferDetails.recipient.startsWith("0x") ? transferDetails.recipient : "0x" + transferDetails.recipient;
      tokenIdHex = transferDetails.tokenId.startsWith("0x") ? transferDetails.tokenId : "0x" + transferDetails.tokenId;
      amountBigInt = transferDetails.amount;
    } catch (error) {
      return {
        isValid: false,
        invalidReason: `envelope_decode_error: ${error instanceof Error ? error.message : String(error)}`,
        network: paymentPayload.network,
      };
    }
  } else {
    // Object format from RPC
    // Handle both versioned (Release20260303) and legacy formats
    let tx = envelope.transaction as Record<string, unknown>;
    if (!tx) {
      return {
        isValid: false,
        invalidReason: "missing_transaction",
        network: paymentPayload.network,
      };
    }
    
    // Unwrap versioned transaction if present
    if (tx.Release20260303) {
      tx = tx.Release20260303 as Record<string, unknown>;
    }
    
    // Verify it's a TokenTransfer
    const claim = tx.claim as Record<string, unknown> | undefined;
    if (!claim?.TokenTransfer) {
      return {
        isValid: false,
        invalidReason: "not_a_token_transfer",
        network: paymentPayload.network,
      };
    }

    const transfer = claim.TokenTransfer as {
      token_id: number[];
      amount: string;
      user_data: number[] | null;
    };
    
    // Convert byte arrays to hex for comparison
    senderHex = "0x" + Buffer.from(tx.sender as number[]).toString("hex");
    recipientHex = "0x" + Buffer.from(tx.recipient as number[]).toString("hex");
    tokenIdHex = "0x" + Buffer.from(transfer.token_id).toString("hex");
    
    try {
      amountBigInt = parseFastRpcAmount(transfer.amount);
    } catch {
      return {
        isValid: false,
        invalidReason: `invalid_amount_format: ${transfer.amount}`,
        payer: senderHex,
        network: paymentPayload.network,
      };
    }
  }

  // Verify recipient matches payTo (comparing hex pubkeys with bech32m addresses)
  if (!addressesMatch(recipientHex, paymentRequirement.payTo)) {
    return {
      isValid: false,
      invalidReason: `recipient_mismatch: expected ${paymentRequirement.payTo}, got ${recipientHex}`,
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  // Verify amount >= maxAmountRequired
  // Note: Both are in the same decimal format (6 decimals for USDC)
  const requiredAmount = BigInt(paymentRequirement.maxAmountRequired);

  if (amountBigInt < requiredAmount) {
    return {
      isValid: false,
      invalidReason: `insufficient_amount: required ${requiredAmount.toString()}, got ${amountBigInt.toString()}`,
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  // Verify token matches asset (if asset is specified)
  if (paymentRequirement.asset) {
    const normalizedAsset = normalizeAddress(paymentRequirement.asset);
    const normalizedTokenId = normalizeAddress(tokenIdHex);
    
    if (normalizedAsset !== normalizedTokenId) {
      return {
        isValid: false,
        invalidReason: `token_mismatch: expected ${paymentRequirement.asset}, got ${tokenIdHex}`,
        payer: senderHex,
        network: paymentPayload.network,
      };
    }
  }

  // TODO: Verify committee signatures cryptographically
  // This would require:
  // 1. Knowing the committee public keys for the network
  // 2. Verifying each signature against the envelope hash
  // For now, we trust the certificate structure + signature count

  return {
    isValid: true,
    payer: senderHex,
    network: paymentPayload.network,
  };
}
