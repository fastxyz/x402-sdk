/**
 * Fast BCS re-exports from @fastxyz/sdk
 *
 * Provides BCS schemas and utilities for decoding Fast transaction envelopes.
 */

export {
  TransactionBcs,
  VersionedTransactionBcs,
  decodeTransactionEnvelope as decodeEnvelope,
  getTransferDetails,
  bytesToHex,
  hexToBytes,
  fastAddressToBytes,
} from "@fastxyz/sdk";

export type { DecodedTransaction as DecodedFastTransaction } from "@fastxyz/sdk";
