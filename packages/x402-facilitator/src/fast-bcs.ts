/**
 * Fast BCS (Binary Canonical Serialization) types
 * For decoding transaction envelopes
 */

import { bcs } from "@mysten/bcs";

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
 * @param envelopeHex - Hex-encoded BCS serialized transaction
 * @returns Decoded transaction details
 */
export function decodeEnvelope(envelopeHex: string): DecodedFastTransaction {
  const bytes = hexToBytes(envelopeHex);
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
