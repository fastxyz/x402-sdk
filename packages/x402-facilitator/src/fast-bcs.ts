/**
 * Fast BCS (Binary Canonical Serialization) types
 * For decoding transaction envelopes
 */

import { bcs } from "@mysten/bcs";
import { keccak256, type Hex } from "viem";

const FAST_TRANSACTION_SIGNING_PREFIX = new TextEncoder().encode("Transaction::");

// ---------------------------------------------------------------------------
// BCS Type Definitions — must match Fast on-chain types exactly
// ---------------------------------------------------------------------------

const AmountBcs = bcs.u256().transform({
  input: (val: string) => BigInt(`0x${val}`).toString(),
  output: (val: string) => val,
});

const TokenTransferBcs = bcs.struct("TokenTransfer", {
  token_id: bcs.bytes(32),
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

// ClaimType enum - order is CRITICAL
const ClaimTypeBcs = bcs.enum("ClaimType", {
  TokenTransfer: TokenTransferBcs,           // 0
  TokenCreation: TokenCreationBcs,           // 1
  TokenManagement: TokenManagementBcs,       // 2
  Mint: MintBcs,                             // 3
  Burn: bcs.struct("Burn", {                 // 4
    token_id: bcs.bytes(32),
    amount: AmountBcs,
  }),
  StateInitialization: bcs.struct("StateInitialization", { dummy: bcs.u8() }),  // 5
  StateUpdate: bcs.struct("StateUpdate", { dummy: bcs.u8() }),                  // 6
  ExternalClaim: ExternalClaimFullBcs,       // 7
  StateReset: bcs.struct("StateReset", { dummy: bcs.u8() }),                    // 8
  JoinCommittee: bcs.struct("JoinCommittee", { dummy: bcs.u8() }),              // 9
  LeaveCommittee: bcs.struct("LeaveCommittee", { dummy: bcs.u8() }),            // 10
  ChangeCommittee: bcs.struct("ChangeCommittee", { dummy: bcs.u8() }),          // 11
  Batch: bcs.vector(                         // 12
    bcs.enum("Operation", {
      TokenTransfer: bcs.struct("TokenTransferOperation", {
        token_id: bcs.bytes(32),
        recipient: bcs.bytes(32),
        amount: AmountBcs,
        user_data: bcs.option(bcs.bytes(32)),
      }),
      TokenCreation: TokenCreationBcs,
      TokenManagement: TokenManagementBcs,
      Mint: bcs.struct("MintOperation", {
        token_id: bcs.bytes(32),
        recipient: bcs.bytes(32),
        amount: AmountBcs,
      }),
    })
  ),
});

// Main Transaction structure
export const TransactionBcs = bcs.struct("Transaction", {
  sender: bcs.bytes(32),
  recipient: bcs.bytes(32),
  nonce: bcs.u64(),
  timestamp_nanos: bcs.u128(),
  claim: ClaimTypeBcs,
  archival: bcs.bool(),
});

// ---------------------------------------------------------------------------
// Decoded transaction type
// ---------------------------------------------------------------------------

export interface DecodedFastTransaction {
  sender: Uint8Array;
  recipient: Uint8Array;
  nonce: bigint;
  timestamp_nanos: bigint;
  claim: {
    TokenTransfer?: {
      token_id: Uint8Array;
      amount: string;
      user_data: Uint8Array | null;
    };
    // Other claim types can be added as needed
    [key: string]: unknown;
  };
  archival: boolean;
}

export interface FastSerializableTransaction {
  sender: Uint8Array | number[];
  recipient: Uint8Array | number[];
  nonce: bigint | number | string;
  timestamp_nanos: bigint | number | string;
  claim: {
    TokenTransfer?: {
      token_id: Uint8Array | number[];
      amount: bigint | number | string;
      user_data?: Uint8Array | number[] | null;
    };
    [key: string]: unknown;
  };
  archival?: boolean;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Convert bytes to hex string (with 0x prefix)
 */
export function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Buffer.from(bytes).toString("hex");
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
 * Serialize a Fast TokenTransfer transaction into canonical BCS bytes.
 */
export function serializeFastTransaction(transaction: FastSerializableTransaction): Uint8Array {
  const transfer = transaction.claim?.TokenTransfer;
  if (!transfer) {
    throw new Error("not_a_token_transfer");
  }

  return TransactionBcs.serialize({
    sender: toByteArray(transaction.sender, "sender"),
    recipient: toByteArray(transaction.recipient, "recipient"),
    nonce: toBigInt(transaction.nonce, "nonce"),
    timestamp_nanos: toBigInt(transaction.timestamp_nanos, "timestamp_nanos"),
    claim: {
      TokenTransfer: {
        token_id: toByteArray(transfer.token_id, "token_id"),
        amount: normalizeFastHexAmount(transfer.amount, "amount"),
        user_data: toOptionalByteArray(transfer.user_data, "user_data"),
      },
    },
    archival: Boolean(transaction.archival),
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
 * Hash a Fast transaction the same way the client computes txHash.
 */
export function hashFastTransaction(transaction: FastSerializableTransaction): Hex {
  return keccak256(bytesToHex(serializeFastTransaction(transaction)) as Hex);
}

/**
 * Convert 32-byte pubkey to bech32m address (set1...)
 */
export function pubkeyToAddress(pubkey: Uint8Array): string {
  // Simplified bech32m encoding for display
  // In production, use proper bech32m library
  return "set1" + Buffer.from(pubkey).toString("hex").slice(0, 38);
}

/**
 * Decode a Fast transaction envelope
 * 
 * @param envelope - Hex-encoded string OR byte array (from Fast RPC)
 * @returns Decoded transaction details
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
  
  const decoded = TransactionBcs.parse(bytes);
  
  // Extract claim details
  let claim: DecodedFastTransaction["claim"] = {};
  
  if (decoded.claim && typeof decoded.claim === "object") {
    // BCS enum returns { VariantName: data }
    const claimObj = decoded.claim as Record<string, unknown>;
    
    if ("TokenTransfer" in claimObj) {
      const tt = claimObj.TokenTransfer as {
        token_id: Uint8Array;
        amount: string;
        user_data: Uint8Array | null;
      };
      claim.TokenTransfer = {
        token_id: tt.token_id,
        amount: tt.amount,
        user_data: tt.user_data,
      };
    }
    
    // Copy other claim types as-is
    for (const [key, value] of Object.entries(claimObj)) {
      if (key !== "TokenTransfer") {
        claim[key] = value;
      }
    }
  }
  
  return {
    sender: decoded.sender,
    recipient: decoded.recipient,
    nonce: BigInt(decoded.nonce),
    timestamp_nanos: BigInt(decoded.timestamp_nanos),
    claim,
    archival: decoded.archival,
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
  
  // Amount is stored as decimal string representation of the value
  // Convert to bigint
  const amount = BigInt(tt.amount);
  
  return {
    sender: bytesToHex(tx.sender),
    recipient: bytesToHex(tx.recipient),
    amount,
    tokenId: bytesToHex(tt.token_id),
  };
}
