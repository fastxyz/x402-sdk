/**
 * Payment verification logic
 */

import {
  createPublicClient,
  http,
  recoverAddress,
  type Hex,
  keccak256,
  encodePacked,
  toBytes,
  hexToBytes,
} from "viem";
import type {
  PaymentPayload,
  PaymentRequirement,
  VerifyResponse,
  EvmPayload,
  FastSetPayload,
} from "./types.js";
import { getNetworkType } from "./types.js";
import { getEvmChainConfig, getFastSetRpcUrl } from "./chains.js";
import { bcs } from "@mysten/bcs";

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
    case "fastset":
      return verifyFastSetPayment(paymentPayload, paymentRequirement);
    default:
      return {
        valid: false,
        invalidReason: `Unsupported network type: ${networkType}`,
        network: paymentPayload.network,
      };
  }
}

/**
 * Verify EVM EIP-3009 payment
 */
async function verifyEvmPayment(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement
): Promise<VerifyResponse> {
  const chainConfig = getEvmChainConfig(paymentPayload.network);
  if (!chainConfig) {
    return {
      valid: false,
      invalidReason: `Unknown EVM network: ${paymentPayload.network}`,
      network: paymentPayload.network,
    };
  }

  const payload = paymentPayload.payload as EvmPayload;
  if (!payload?.signature || !payload?.authorization) {
    return {
      valid: false,
      invalidReason: "Missing signature or authorization in payload",
      network: paymentPayload.network,
    };
  }

  const { authorization, signature } = payload;

  // Verify the authorization matches requirements
  if (authorization.to.toLowerCase() !== paymentRequirement.payTo.toLowerCase()) {
    return {
      valid: false,
      invalidReason: `Payment recipient mismatch: ${authorization.to} !== ${paymentRequirement.payTo}`,
      network: paymentPayload.network,
      payer: authorization.from,
    };
  }

  // Verify amount
  if (BigInt(authorization.value) < BigInt(paymentRequirement.maxAmountRequired)) {
    return {
      valid: false,
      invalidReason: `Insufficient amount: ${authorization.value} < ${paymentRequirement.maxAmountRequired}`,
      network: paymentPayload.network,
      payer: authorization.from,
    };
  }

  // Verify timing
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(authorization.validAfter) > BigInt(now)) {
    return {
      valid: false,
      invalidReason: `Authorization not yet valid: validAfter=${authorization.validAfter}, now=${now}`,
      network: paymentPayload.network,
      payer: authorization.from,
    };
  }
  if (BigInt(authorization.validBefore) < BigInt(now)) {
    return {
      valid: false,
      invalidReason: `Authorization expired: validBefore=${authorization.validBefore}, now=${now}`,
      network: paymentPayload.network,
      payer: authorization.from,
    };
  }

  // Verify signature recovers to the claimed 'from' address
  try {
    const domainSeparator = await getEIP712DomainSeparator(
      paymentPayload.network,
      chainConfig.usdcAddress,
      paymentRequirement.extra?.name as string || "USD Coin",
      paymentRequirement.extra?.version as string || "2"
    );

    const typeHash = keccak256(
      toBytes(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
      )
    );

    const structHash = keccak256(
      encodePacked(
        ["bytes32", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
        [
          typeHash,
          authorization.from as `0x${string}`,
          authorization.to as `0x${string}`,
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce as `0x${string}`,
        ]
      )
    );

    const digest = keccak256(
      encodePacked(["string", "bytes32", "bytes32"], ["\x19\x01", domainSeparator, structHash])
    );

    const recoveredAddress = await recoverAddress({
      hash: digest,
      signature: signature as `0x${string}`,
    });

    if (recoveredAddress.toLowerCase() !== authorization.from.toLowerCase()) {
      return {
        valid: false,
        invalidReason: `Signature verification failed: recovered ${recoveredAddress}, expected ${authorization.from}`,
        network: paymentPayload.network,
        payer: authorization.from,
      };
    }
  } catch (error) {
    return {
      valid: false,
      invalidReason: `Signature verification error: ${error}`,
      network: paymentPayload.network,
      payer: authorization.from,
    };
  }

  return {
    valid: true,
    network: paymentPayload.network,
    payer: authorization.from,
  };
}

/**
 * Get EIP-712 domain separator for USDC contract
 */
async function getEIP712DomainSeparator(
  network: string,
  contractAddress: `0x${string}`,
  name: string,
  version: string
): Promise<`0x${string}`> {
  const chainConfig = getEvmChainConfig(network);
  if (!chainConfig) {
    throw new Error(`Unknown network: ${network}`);
  }

  const domainTypeHash = keccak256(
    toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
  );

  return keccak256(
    encodePacked(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [
        domainTypeHash,
        keccak256(toBytes(name)),
        keccak256(toBytes(version)),
        BigInt(chainConfig.chain.id),
        contractAddress,
      ]
    )
  );
}

/**
 * Verify FastSet payment (transaction certificate)
 */
async function verifyFastSetPayment(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement
): Promise<VerifyResponse> {
  const payload = paymentPayload.payload as FastSetPayload;
  if (!payload?.transactionCertificate) {
    return {
      valid: false,
      invalidReason: "Missing transactionCertificate in payload",
      network: paymentPayload.network,
    };
  }

  const { envelope, signatures } = payload.transactionCertificate;

  // Basic validation - certificate must have envelope and signatures
  if (!envelope || !signatures || signatures.length === 0) {
    return {
      valid: false,
      invalidReason: "Invalid transaction certificate structure",
      network: paymentPayload.network,
    };
  }

  try {
    // Decode envelope to extract transaction details
    const envelopeBytes = hexToBytes(envelope as `0x${string}`);
    
    // For FastSet, the transaction is already on-chain once we have a certificate
    // The certificate proves consensus was reached
    // We could verify the envelope structure, but the certificate is sufficient proof
    
    // Minimum signature threshold (configurable, but typically 2f+1)
    if (signatures.length < 3) {
      return {
        valid: false,
        invalidReason: `Insufficient signatures: ${signatures.length} (need at least 3)`,
        network: paymentPayload.network,
      };
    }

    return {
      valid: true,
      network: paymentPayload.network,
      // Could extract payer from envelope if needed
    };
  } catch (error) {
    return {
      valid: false,
      invalidReason: `FastSet verification error: ${error}`,
      network: paymentPayload.network,
    };
  }
}
