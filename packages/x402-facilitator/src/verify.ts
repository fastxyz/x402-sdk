/**
 * Payment verification logic
 * Aligned with reference implementation
 */

import { createPublicKey, verify as verifySignature } from "node:crypto";
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
  FacilitatorConfig,
  FastCommitteeSignature,
  FastTransactionCertificate,
} from "./types.js";
import { getNetworkType, getNetworkId } from "./types.js";
import {
  FAST_TRUSTED_COMMITTEE_PUBLIC_KEYS,
  getEvmChainConfig,
  getFastNetworkFromNetworkId,
  getExpectedFastNetworkId,
  getFastRpcUrl,
} from "./chains.js";
import {
  createFastTransactionSigningMessage,
  decodeEnvelope,
  getTransferDetails,
  serializeFastTransaction,
  unwrapFastTransaction,
} from "./fast-bcs.js";

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
  paymentRequirement: PaymentRequirement,
  config: FacilitatorConfig = {}
): Promise<VerifyResponse> {
  const networkType = getNetworkType(paymentPayload.network);

  switch (networkType) {
    case "evm":
      return verifyEvmPayment(paymentPayload, paymentRequirement);
    case "fast":
      return verifyFastPayment(paymentPayload, paymentRequirement, config);
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
 * Decode a Fast bech32m address to hex.
 */
function bech32mToHex(addr: string): string | null {
  try {
    const normalized = addr.toLowerCase();
    if (!normalized.startsWith("fast1") && !normalized.startsWith("set1")) {
      return null;
    }

    const sep = normalized.indexOf("1");
    if (sep === -1) return null;

    const data = normalized.slice(sep + 1);
    const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

    const values: number[] = [];
    for (const c of data) {
      const idx = CHARSET.indexOf(c);
      if (idx === -1) return null;
      values.push(idx);
    }

    const dataValues = values.slice(0, -6);
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

    return result.length === 32 ? Buffer.from(result).toString("hex") : null;
  } catch {
    return null;
  }
}

function normalizeComparableAddress(addr: string): string | null {
  if (addr.startsWith("fast1") || addr.startsWith("set1")) {
    return bech32mToHex(addr);
  }

  return normalizeAddress(addr);
}

/**
 * Compare two addresses for equality
 * Supports hex pubkeys and bech32m addresses (fast1... or set1...)
 */
function addressesMatch(a: string, b: string): boolean {
  const normalizedA = normalizeComparableAddress(a);
  const normalizedB = normalizeComparableAddress(b);
  return normalizedA != null && normalizedB != null && normalizedA === normalizedB;
}

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const warnedUntrustedCommitteeNetworks = new Set<string>();

function toByteArray(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (typeof value === "string") {
    if (!/^(?:0x)?[0-9a-fA-F]+$/.test(value)) {
      return null;
    }

    const normalized = value.startsWith("0x") ? value.slice(2) : value;
    if (normalized.length === 0 || normalized.length % 2 !== 0) {
      return null;
    }

    return new Uint8Array(Buffer.from(normalized, "hex"));
  }

  if (Array.isArray(value) && value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
    return new Uint8Array(value);
  }

  return null;
}

function verifyEd25519(
  publicKeyBytes: Uint8Array,
  message: Uint8Array,
  signatureBytes: Uint8Array
): boolean {
  if (publicKeyBytes.length !== 32 || signatureBytes.length !== 64) {
    return false;
  }

  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
      format: "der",
      type: "spki",
    });

    return verifySignature(null, Buffer.from(message), publicKey, Buffer.from(signatureBytes));
  } catch {
    return false;
  }
}

function parseCommitteeSignature(
  entry: FastCommitteeSignature | unknown
): { publicKey: Uint8Array; signature: Uint8Array } | null {
  if (Array.isArray(entry) && entry.length === 2) {
    const publicKey = toByteArray(entry[0]);
    const signature = toByteArray(entry[1]);

    if (!publicKey || !signature) {
      return null;
    }

    return { publicKey, signature };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const member = record.committee_member ?? record.validator;
  const publicKey = toByteArray(member);
  const signature = toByteArray(record.signature);

  if (!publicKey || !signature) {
    return null;
  }

  return { publicKey, signature };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}

function signatureKey(publicKey: Uint8Array, signature: Uint8Array): string {
  return `${Buffer.from(publicKey).toString("hex")}:${Buffer.from(signature).toString("hex")}`;
}

function quorumThreshold(totalMembers: number): number {
  return Math.floor((2 * totalMembers) / 3) + 1;
}

interface ResolvedTrustedCommittee {
  memberKeys: Set<string>;
  minSignatures: number;
}

function parseTrustedCommitteePublicKey(value: string): string | null {
  const bytes = toByteArray(value);
  if (bytes?.length === 32) {
    return Buffer.from(bytes).toString("hex");
  }

  return bech32mToHex(value);
}

function resolveTrustedCommittee(
  network: string,
  config: FacilitatorConfig
): ResolvedTrustedCommittee | null {
  const configuredKeys = config.committeePublicKeys?.[network];
  const bundledKeys = FAST_TRUSTED_COMMITTEE_PUBLIC_KEYS[network];
  const keys = configuredKeys ?? bundledKeys;

  if (!keys?.length) {
    return null;
  }

  const memberKeys = new Set<string>();
  for (const key of keys) {
    const parsed = parseTrustedCommitteePublicKey(key);
    if (!parsed) {
      throw new Error(`invalid_committee_public_key:${key}`);
    }
    memberKeys.add(parsed);
  }

  if (memberKeys.size === 0) {
    throw new Error("empty_committee_public_keys");
  }

  return {
    memberKeys,
    minSignatures: quorumThreshold(memberKeys.size),
  };
}

function warnUntrustedCommittee(network: string, fastRpcUrl?: string): void {
  const rpcUrl = getFastRpcUrl(network, fastRpcUrl);
  const warningKey = `${network}:${rpcUrl}`;
  if (warnedUntrustedCommitteeNetworks.has(warningKey)) {
    return;
  }

  warnedUntrustedCommitteeNetworks.add(warningKey);
  console.warn(
    `x402-facilitator: no trusted Fast committee configured for ${network}; ` +
      `verification is trusting ${rpcUrl} for committee membership.`
  );
}

interface FastRpcAccountInfoResponse {
  requested_certificates: FastTransactionCertificate[] | null;
}

async function fetchFastCertificateByNonce(
  network: string,
  senderPublicKey: Uint8Array,
  nonce: bigint,
  fastRpcUrl?: string
): Promise<FastTransactionCertificate | null> {
  if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("nonce_out_of_range");
  }

  const response = await fetch(getFastRpcUrl(network, fastRpcUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "proxy_getAccountInfo",
      params: {
        address: Array.from(senderPublicKey),
        token_balances_filter: [],
        certificate_by_nonce: {
          start: Number(nonce),
          limit: 1,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`http_${response.status}`);
  }

  const json = await response.json() as {
    result?: FastRpcAccountInfoResponse;
    error?: { message?: string };
  };

  if (json.error) {
    throw new Error(json.error.message || "unknown_rpc_error");
  }

  return json.result?.requested_certificates?.[0] ?? null;
}

/**
 * Verify Fast payment by validating the transaction certificate
 * 
 * Verifies:
 * 1. Certificate structure matches Fast RPC output
 * 2. Sender signature verifies against "VersionedTransaction::" + serialized transaction
 * 3. Committee signatures verify against the serialized transaction
 * 4. Verify recipient matches payTo
 * 5. Verify amount >= maxAmountRequired
 * 6. Verify token matches asset
 */
async function verifyFastPayment(
  paymentPayload: PaymentPayload,
  paymentRequirement: PaymentRequirement,
  config: FacilitatorConfig
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
  const { envelope, signatures } = certificate as FastTransactionCertificate;

  // Validate certificate structure
  if (!envelope) {
    return {
      isValid: false,
      invalidReason: "missing_envelope",
      network: paymentPayload.network,
    };
  }

  if (!Array.isArray(signatures) || signatures.length === 0) {
    return {
      isValid: false,
      invalidReason: "missing_signatures",
      network: paymentPayload.network,
    };
  }

  if (typeof envelope !== "object") {
    return {
      isValid: false,
      invalidReason: "unsupported_fast_certificate_format",
      network: paymentPayload.network,
    };
  }

  if (!envelope.transaction) {
    return {
      isValid: false,
      invalidReason: "missing_transaction",
      network: paymentPayload.network,
    };
  }

  let transaction;
  try {
    transaction = unwrapFastTransaction(envelope.transaction);
  } catch {
    return {
      isValid: false,
      invalidReason: "unsupported_fast_certificate_format",
      network: paymentPayload.network,
    };
  }

  if (envelope.signature?.MultiSig) {
    return {
      isValid: false,
      invalidReason: "unsupported_fast_transaction_multisig",
      network: paymentPayload.network,
    };
  }

  const senderSignature = toByteArray(envelope.signature?.Signature);
  if (!senderSignature) {
    return {
      isValid: false,
      invalidReason: "missing_transaction_signature",
      network: paymentPayload.network,
    };
  }

  let transactionBytes: Uint8Array;
  try {
    transactionBytes = serializeFastTransaction(transaction);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      isValid: false,
      invalidReason: message === "not_a_token_transfer" ? message : `invalid_transaction: ${message}`,
      network: paymentPayload.network,
    };
  }

  const decoded = decodeEnvelope(transactionBytes);
  const transferDetails = getTransferDetails(decoded);
  if (!transferDetails) {
    return {
      isValid: false,
      invalidReason: "not_a_token_transfer",
      network: paymentPayload.network,
    };
  }

  let senderHex: string;
  let recipientHex: string;
  let tokenIdHex: string;
  let amountBigInt: bigint;
  senderHex = transferDetails.sender;
  recipientHex = transferDetails.recipient;
  tokenIdHex = transferDetails.tokenId;
  amountBigInt = transferDetails.amount;

  const resolvedCertificateNetwork = getFastNetworkFromNetworkId(decoded.network_id);
  if (!resolvedCertificateNetwork) {
    return {
      isValid: false,
      invalidReason: `invalid_network: unsupported fast network_id ${decoded.network_id}`,
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  const expectedNetworkId = getExpectedFastNetworkId(paymentPayload.network);
  if (expectedNetworkId && decoded.network_id !== expectedNetworkId) {
    return {
      isValid: false,
      invalidReason: `invalid_network: expected ${expectedNetworkId}, got ${decoded.network_id}`,
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  const effectiveFastNetwork = paymentPayload.network === "fast"
    ? resolvedCertificateNetwork
    : paymentPayload.network;

  const effectiveCommitteeConfig = (
    paymentPayload.network !== effectiveFastNetwork &&
    config.committeePublicKeys?.[paymentPayload.network] &&
    !config.committeePublicKeys?.[effectiveFastNetwork]
  )
    ? {
        ...config,
        committeePublicKeys: {
          ...config.committeePublicKeys,
          [effectiveFastNetwork]: config.committeePublicKeys[paymentPayload.network],
        },
      }
    : config;

  let trustedCommittee: ResolvedTrustedCommittee | null;
  try {
    trustedCommittee = resolveTrustedCommittee(effectiveFastNetwork, effectiveCommitteeConfig);
  } catch (error) {
    return {
      isValid: false,
      invalidReason: `invalid_committee_configuration: ${error instanceof Error ? error.message : String(error)}`,
      network: paymentPayload.network,
    };
  }

  if (!trustedCommittee) {
    warnUntrustedCommittee(effectiveFastNetwork, config.fastRpcUrl);
  }

  const minSignatures = trustedCommittee?.minSignatures ?? 3;
  if (signatures.length < minSignatures) {
    return {
      isValid: false,
      invalidReason: `insufficient_signatures: need ${minSignatures}, got ${signatures.length}`,
      network: paymentPayload.network,
    };
  }

  const senderSigningMessage = createFastTransactionSigningMessage(transactionBytes);
  const senderPublicKey = toByteArray(transaction.sender);
  if (!senderPublicKey) {
    return {
      isValid: false,
      invalidReason: "invalid_transaction: invalid_sender",
      network: paymentPayload.network,
    };
  }

  if (!verifyEd25519(senderPublicKey, senderSigningMessage, senderSignature)) {
    return {
      isValid: false,
      invalidReason: "invalid_fast_transaction_signature",
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  const seenCommitteeMembers = new Set<string>();
  for (const signatureEntry of signatures) {
    const parsedSignature = parseCommitteeSignature(signatureEntry);
    if (!parsedSignature) {
      return {
        isValid: false,
        invalidReason: "unsupported_fast_certificate_format",
        payer: senderHex,
        network: paymentPayload.network,
      };
    }

    const memberKey = Buffer.from(parsedSignature.publicKey).toString("hex");
    if (seenCommitteeMembers.has(memberKey)) {
      return {
        isValid: false,
        invalidReason: "duplicate_committee_signature",
        payer: senderHex,
        network: paymentPayload.network,
      };
    }
    seenCommitteeMembers.add(memberKey);

    if (trustedCommittee && !trustedCommittee.memberKeys.has(memberKey)) {
      return {
        isValid: false,
        invalidReason: "unknown_fast_committee_signer",
        payer: senderHex,
        network: paymentPayload.network,
      };
    }

    if (!verifyEd25519(parsedSignature.publicKey, transactionBytes, parsedSignature.signature)) {
      return {
        isValid: false,
        invalidReason: "invalid_fast_committee_signature",
        payer: senderHex,
        network: paymentPayload.network,
      };
    }
  }

  let networkCertificate: FastTransactionCertificate | null;
  try {
    networkCertificate = await fetchFastCertificateByNonce(
      effectiveFastNetwork,
      senderPublicKey,
      decoded.nonce,
      config.fastRpcUrl
    );
  } catch (error) {
    return {
      isValid: false,
      invalidReason: `fast_certificate_lookup_failed: ${error instanceof Error ? error.message : String(error)}`,
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  if (!networkCertificate) {
    return {
      isValid: false,
      invalidReason: "fast_certificate_not_found",
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  let networkTransactionBytes: Uint8Array;
  let networkTransaction;
  try {
    networkTransaction = unwrapFastTransaction(networkCertificate.envelope.transaction);
    networkTransactionBytes = serializeFastTransaction(networkTransaction);
  } catch (error) {
    return {
      isValid: false,
      invalidReason: "invalid_network_fast_certificate",
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  if (!bytesEqual(transactionBytes, networkTransactionBytes)) {
    return {
      isValid: false,
      invalidReason: "fast_certificate_mismatch",
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  const networkSenderSignature = toByteArray(networkCertificate.envelope.signature?.Signature);
  if (!networkSenderSignature || !bytesEqual(senderSignature, networkSenderSignature)) {
    return {
      isValid: false,
      invalidReason: "fast_certificate_mismatch",
      payer: senderHex,
      network: paymentPayload.network,
    };
  }

  const networkCommitteeSignatureKeys = new Set<string>();
  for (const signatureEntry of networkCertificate.signatures) {
    const parsedSignature = parseCommitteeSignature(signatureEntry);
    if (!parsedSignature) {
      return {
        isValid: false,
        invalidReason: "invalid_network_fast_certificate",
        payer: senderHex,
        network: paymentPayload.network,
      };
    }

    networkCommitteeSignatureKeys.add(
      signatureKey(parsedSignature.publicKey, parsedSignature.signature)
    );
  }

  for (const signatureEntry of signatures) {
    const parsedSignature = parseCommitteeSignature(signatureEntry);
    if (!parsedSignature) {
      return {
        isValid: false,
        invalidReason: "unsupported_fast_certificate_format",
        payer: senderHex,
        network: paymentPayload.network,
      };
    }

    if (!networkCommitteeSignatureKeys.has(
      signatureKey(parsedSignature.publicKey, parsedSignature.signature)
    )) {
      return {
        isValid: false,
        invalidReason: "fast_certificate_mismatch",
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

  return {
    isValid: true,
    payer: senderHex,
    network: paymentPayload.network,
  };
}
