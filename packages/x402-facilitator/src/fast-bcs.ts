/**
 * Fast BCS helpers re-exported from the canonical fast-sdk codec.
 */

import {
  FAST_NETWORK_IDS,
  TransactionBcs,
  VersionedTransactionBcs,
  bytesToHex,
  decodeTransactionEnvelope,
  encodeFastAddress,
  fastAddressToBytes,
  getTransferDetails,
  hexToBytes,
  type DecodedTransaction,
} from "@fastxyz/sdk/core";

export {
  FAST_NETWORK_IDS,
  TransactionBcs,
  VersionedTransactionBcs,
  bytesToHex,
  fastAddressToBytes,
  getTransferDetails,
  hexToBytes,
};

export type DecodedFastTransaction = DecodedTransaction;

export function pubkeyToAddress(pubkey: Uint8Array): string {
  return encodeFastAddress(pubkey);
}

export function decodeEnvelope(
  envelope: string | number[] | Uint8Array,
): DecodedFastTransaction {
  return decodeTransactionEnvelope(envelope);
}
