/**
 * Fast BCS (Binary Canonical Serialization) types
 * For decoding and verifying Fast transaction certificates.
 */

import { bcs } from "@mysten/bcs";
import { keccak256, type Hex } from "viem";

const FAST_TRANSACTION_SIGNING_PREFIX = new TextEncoder().encode("VersionedTransaction::");

// ---------------------------------------------------------------------------
// BCS Type Definitions — must match the current Fast protocol exactly
// ---------------------------------------------------------------------------

const AmountBcs = bcs.u256().transform({
  input: (val: string) => BigInt(`0x${val}`).toString(),
});

const TokenTransferBcs = bcs.struct("TokenTransfer", {
  token_id: bcs.bytes(32),
  recipient: bcs.bytes(32),
  amount: AmountBcs,
  user_data: bcs.option(bcs.bytes(32)),
});

const TokenCreationBcs = bcs.struct("TokenCreation", {
  token_name: bcs.string(),
  decimals: bcs.u8(),
  initial_amount: AmountBcs,
  mints: bcs.vector(bcs.bytes(32)),
  user_data: bcs.option(bcs.bytes(32)),
});

const AddressChangeBcs = bcs.enum("AddressChange", {
  Add: bcs.tuple([]),
  Remove: bcs.tuple([]),
});

const TokenManagementBcs = bcs.struct("TokenManagement", {
  token_id: bcs.bytes(32),
  update_id: bcs.u64(),
  new_admin: bcs.option(bcs.bytes(32)),
  mints: bcs.vector(bcs.tuple([AddressChangeBcs, bcs.bytes(32)])),
  user_data: bcs.option(bcs.bytes(32)),
});

const MintBcs = bcs.struct("Mint", {
  token_id: bcs.bytes(32),
  recipient: bcs.bytes(32),
  amount: AmountBcs,
});

const BurnBcs = bcs.struct("Burn", {
  token_id: bcs.bytes(32),
  amount: AmountBcs,
});

const ExternalClaimBodyBcs = bcs.struct("ExternalClaimBody", {
  verifier_committee: bcs.vector(bcs.bytes(32)),
  verifier_quorum: bcs.u64(),
  claim_data: bcs.vector(bcs.u8()),
});

const ExternalClaimFullBcs = bcs.struct("ExternalClaimFull", {
  claim: ExternalClaimBodyBcs,
  signatures: bcs.vector(bcs.tuple([bcs.bytes(32), bcs.bytes(64)])),
});

const ClaimTypeBcs = bcs.enum("ClaimType", {
  TokenTransfer: TokenTransferBcs,
  TokenCreation: TokenCreationBcs,
  TokenManagement: TokenManagementBcs,
  Mint: MintBcs,
  Burn: BurnBcs,
  StateInitialization: bcs.struct("StateInitialization", { dummy: bcs.u8() }),
  StateUpdate: bcs.struct("StateUpdate", { dummy: bcs.u8() }),
  ExternalClaim: ExternalClaimFullBcs,
  StateReset: bcs.struct("StateReset", { dummy: bcs.u8() }),
  JoinCommittee: bcs.struct("JoinCommittee", { dummy: bcs.u8() }),
  LeaveCommittee: bcs.struct("LeaveCommittee", { dummy: bcs.u8() }),
  ChangeCommittee: bcs.struct("ChangeCommittee", { dummy: bcs.u8() }),
  Batch: bcs.vector(
    bcs.enum("Operation", {
      TokenTransfer: TokenTransferBcs,
      TokenCreation: TokenCreationBcs,
      TokenManagement: TokenManagementBcs,
      Mint: MintBcs,
    })
  ),
});

export const TransactionBcs = bcs.struct("Transaction", {
  network_id: bcs.string(),
  sender: bcs.bytes(32),
  nonce: bcs.u64(),
  timestamp_nanos: bcs.u128(),
  claim: ClaimTypeBcs,
  archival: bcs.bool(),
  fee_token: bcs.option(bcs.bytes(32)),
});

export const VersionedTransactionBcs = bcs.enum("VersionedTransaction", {
  Release20260319: TransactionBcs,
});

// ---------------------------------------------------------------------------
// Decoded transaction types
// ---------------------------------------------------------------------------

export interface DecodedFastTransaction {
  network_id: string;
  sender: Uint8Array;
  nonce: bigint;
  timestamp_nanos: bigint;
  claim: {
    TokenTransfer?: {
      token_id: Uint8Array;
      recipient: Uint8Array;
      amount: string;
      user_data: Uint8Array | null;
    };
    [key: string]: unknown;
  };
  archival: boolean;
  fee_token: Uint8Array | null;
}

export interface FastSerializableTransaction {
  network_id: string;
  sender: Uint8Array | number[];
  nonce: bigint | number | string;
  timestamp_nanos: bigint | number | string;
  claim: {
    TokenTransfer?: {
      token_id: Uint8Array | number[];
      recipient: Uint8Array | number[];
      amount: bigint | number | string;
      user_data?: Uint8Array | number[] | null;
    };
    [key: string]: unknown;
  };
  archival?: boolean;
  fee_token?: Uint8Array | number[] | null;
}

export type FastVersionedTransaction =
  | FastSerializableTransaction
  | { Release20260319: FastSerializableTransaction };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFastSerializableTransaction(value: unknown): value is FastSerializableTransaction {
  return isRecord(value) &&
    typeof value.network_id === "string" &&
    "sender" in value &&
    "nonce" in value &&
    "timestamp_nanos" in value &&
    "claim" in value;
}

/**
 * Fast certificates wrap the transaction in VersionedTransaction::Release20260319.
 * The SDK also uses the bare inner transaction shape internally, so accept both.
 */
export function unwrapFastTransaction(transaction: unknown): FastSerializableTransaction {
  if (isFastSerializableTransaction(transaction)) {
    return transaction;
  }

  if (
    isRecord(transaction) &&
    "Release20260319" in transaction &&
    isFastSerializableTransaction(transaction.Release20260319)
  ) {
    return transaction.Release20260319;
  }

  throw new Error("unsupported_fast_transaction_format");
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Convert bytes to hex string (with 0x prefix)
 */
export function bytesToHex(bytes: Uint8Array | number[]): string {
  const normalized = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return "0x" + Buffer.from(normalized).toString("hex");
}

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(Buffer.from(clean, "hex"));
}

function toByteArray(value: Uint8Array | number[], field: string): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (Array.isArray(value) && value.every(v => Number.isInteger(v) && v >= 0 && v <= 255)) {
    return new Uint8Array(value);
  }

  throw new Error(`invalid_${field}`);
}

function toOptionalByteArray(
  value: Uint8Array | number[] | null | undefined,
  field: string
): Uint8Array | null {
  if (value == null) {
    return null;
  }

  return toByteArray(value, field);
}

function toBigInt(value: bigint | number | string, field: string): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`invalid_${field}`);
    }

    return value;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`invalid_${field}`);
    }

    return BigInt(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error(`invalid_${field}`);
    }

    return BigInt(normalized);
  }

  throw new Error(`invalid_${field}`);
}

function normalizeFastHexAmount(value: bigint | number | string, field: string): string {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`invalid_${field}`);
    }

    return value.toString(16);
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`invalid_${field}`);
    }

    return value.toString(16);
  }

  if (typeof value === "string") {
    const normalized = value.startsWith("0x") ? value.slice(2) : value;
    if (!normalized || !/^[0-9a-fA-F]+$/.test(normalized)) {
      throw new Error(`invalid_${field}`);
    }

    return normalized.toLowerCase();
  }

  throw new Error(`invalid_${field}`);
}

/**
 * Fast RPC object envelopes encode amounts as hex strings without a 0x prefix.
 */
export function parseFastRpcAmount(amount: string): bigint {
  const normalized = amount.startsWith("0x") ? amount : `0x${amount}`;
  return BigInt(normalized);
}

/**
 * Serialize a Fast transaction into VersionedTransaction::Release20260319 bytes.
 */
export function serializeFastTransaction(transaction: FastVersionedTransaction): Uint8Array {
  const normalizedTransaction = unwrapFastTransaction(transaction);
  const transfer = normalizedTransaction.claim?.TokenTransfer;
  if (!transfer) {
    throw new Error("not_a_token_transfer");
  }

  return VersionedTransactionBcs.serialize({
    Release20260319: {
      network_id: normalizedTransaction.network_id,
      sender: toByteArray(normalizedTransaction.sender, "sender"),
      nonce: toBigInt(normalizedTransaction.nonce, "nonce"),
      timestamp_nanos: toBigInt(normalizedTransaction.timestamp_nanos, "timestamp_nanos"),
      claim: {
        TokenTransfer: {
          token_id: toByteArray(transfer.token_id, "token_id"),
          recipient: toByteArray(transfer.recipient, "recipient"),
          amount: normalizeFastHexAmount(transfer.amount, "amount"),
          user_data: toOptionalByteArray(transfer.user_data, "user_data"),
        },
      },
      archival: Boolean(normalizedTransaction.archival),
      fee_token: toOptionalByteArray(normalizedTransaction.fee_token, "fee_token"),
    },
  }).toBytes();
}

/**
 * Build the sender signing payload used by Fast for transaction submission.
 */
export function createFastTransactionSigningMessage(transactionBytes: Uint8Array): Uint8Array {
  const message = new Uint8Array(
    FAST_TRANSACTION_SIGNING_PREFIX.length + transactionBytes.length
  );
  message.set(FAST_TRANSACTION_SIGNING_PREFIX, 0);
  message.set(transactionBytes, FAST_TRANSACTION_SIGNING_PREFIX.length);
  return message;
}

/**
 * Hash a Fast transaction the same way the SDK computes txHash.
 */
export function hashFastTransaction(transaction: FastVersionedTransaction): Hex {
  return keccak256(bytesToHex(serializeFastTransaction(transaction)) as Hex);
}

/**
 * Convert 32-byte pubkey to bech32m address (set1...)
 */
export function pubkeyToAddress(pubkey: Uint8Array): string {
  return "set1" + Buffer.from(pubkey).toString("hex").slice(0, 38);
}

/**
 * Decode a Fast transaction envelope.
 *
 * Supports both Release20260319 versioned bytes and bare current transaction bytes.
 */
export function decodeEnvelope(envelope: string | number[] | Uint8Array): DecodedFastTransaction {
  let bytes: Uint8Array;

  if (typeof envelope === "string") {
    bytes = hexToBytes(envelope);
  } else if (Array.isArray(envelope)) {
    bytes = new Uint8Array(envelope);
  } else if (envelope instanceof Uint8Array) {
    bytes = envelope;
  } else {
    throw new Error(`Invalid envelope type: ${typeof envelope}`);
  }

  let decoded: FastSerializableTransaction;
  try {
    const versioned = VersionedTransactionBcs.parse(bytes);
    decoded = unwrapFastTransaction(versioned);
  } catch {
    decoded = TransactionBcs.parse(bytes) as FastSerializableTransaction;
  }

  const claim: DecodedFastTransaction["claim"] = {};
  if (decoded.claim && typeof decoded.claim === "object") {
    const claimObj = decoded.claim as Record<string, unknown>;

    if ("TokenTransfer" in claimObj) {
      const tt = claimObj.TokenTransfer as {
        token_id: Iterable<number>;
        recipient: Iterable<number>;
        amount: string;
        user_data: Iterable<number> | null;
      };
      claim.TokenTransfer = {
        token_id: new Uint8Array(tt.token_id),
        recipient: new Uint8Array(tt.recipient),
        amount: tt.amount,
        user_data: tt.user_data ? new Uint8Array(tt.user_data) : null,
      };
    }

    for (const [key, value] of Object.entries(claimObj)) {
      if (key !== "TokenTransfer") {
        claim[key] = value;
      }
    }
  }

  return {
    network_id: decoded.network_id,
    sender: toByteArray(decoded.sender, "sender"),
    nonce: BigInt(decoded.nonce),
    timestamp_nanos: BigInt(decoded.timestamp_nanos),
    claim,
    archival: Boolean(decoded.archival),
    fee_token: toOptionalByteArray(decoded.fee_token, "fee_token"),
  };
}

/**
 * Extract transfer details from a decoded transaction
 *
 * @param tx - Decoded transaction
 * @returns Transfer details or null if not a TokenTransfer
 */
export function getTransferDetails(tx: DecodedFastTransaction): {
  sender: string;
  recipient: string;
  amount: bigint;
  tokenId: string;
} | null {
  if (!tx.claim.TokenTransfer) {
    return null;
  }

  const tt = tx.claim.TokenTransfer;
  const amount = BigInt(tt.amount);

  return {
    sender: bytesToHex(tx.sender),
    recipient: bytesToHex(tt.recipient),
    amount,
    tokenId: bytesToHex(tt.token_id),
  };
}
