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
  serializeVersionedTransaction,
  type FastTransaction,
  type FastVersionedTransaction,
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
  serializeVersionedTransaction,
};

export type DecodedFastTransaction = DecodedTransaction;
export type FastSerializableTransaction = FastTransaction;
export type VersionedFastTransaction = FastVersionedTransaction;

const FAST_TRANSACTION_SIGNING_PREFIX = new TextEncoder().encode("VersionedTransaction::");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrapFastTransaction(transaction: unknown): FastTransaction {
  if (
    isRecord(transaction) &&
    "Release20260319" in transaction &&
    isRecord(transaction.Release20260319)
  ) {
    return transaction.Release20260319 as FastTransaction;
  }

  if (isRecord(transaction) && typeof transaction.network_id === "string") {
    return transaction as FastTransaction;
  }

  throw new Error("unsupported_fast_transaction_format");
}

export function serializeFastTransaction(
  transaction: FastVersionedTransaction | FastTransaction,
): Uint8Array {
  if (
    isRecord(transaction) &&
    "Release20260319" in transaction &&
    isRecord(transaction.Release20260319)
  ) {
    return VersionedTransactionBcs.serialize({
      Release20260319: transaction.Release20260319 as FastTransaction,
    }).toBytes();
  }

  return serializeVersionedTransaction(transaction as FastTransaction);
}

export function pubkeyToAddress(pubkey: Uint8Array): string {
  return encodeFastAddress(pubkey);
}

export function decodeEnvelope(
  envelope: string | number[] | Uint8Array,
): DecodedFastTransaction {
  return decodeTransactionEnvelope(envelope);
}

export function createFastTransactionSigningMessage(
  transactionBytes: Uint8Array,
): Uint8Array {
  const message = new Uint8Array(
    FAST_TRANSACTION_SIGNING_PREFIX.length + transactionBytes.length,
  );
  message.set(FAST_TRANSACTION_SIGNING_PREFIX, 0);
  message.set(transactionBytes, FAST_TRANSACTION_SIGNING_PREFIX.length);
  return message;
}
