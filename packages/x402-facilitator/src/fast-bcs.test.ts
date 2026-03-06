/**
 * Tests for Fast BCS decoding
 */

import { describe, it, expect } from "vitest";
import {
  TransactionBcs,
  decodeEnvelope,
  getTransferDetails,
  bytesToHex,
  hexToBytes,
} from "./fast-bcs.js";

describe("Fast BCS utilities", () => {
  describe("bytesToHex", () => {
    it("converts bytes to hex string with 0x prefix", () => {
      const bytes = new Uint8Array([0x01, 0x02, 0x03, 0xff]);
      expect(bytesToHex(bytes)).toBe("0x010203ff");
    });

    it("handles empty bytes", () => {
      const bytes = new Uint8Array([]);
      expect(bytesToHex(bytes)).toBe("0x");
    });
  });

  describe("hexToBytes", () => {
    it("converts hex string to bytes", () => {
      const result = hexToBytes("0x010203ff");
      expect(result).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0xff]));
    });

    it("handles hex without 0x prefix", () => {
      const result = hexToBytes("010203ff");
      expect(result).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0xff]));
    });
  });

  describe("TransactionBcs", () => {
    it("can serialize and deserialize a TokenTransfer transaction", () => {
      const sender = new Uint8Array(32).fill(0x01);
      const recipient = new Uint8Array(32).fill(0x02);
      const tokenId = new Uint8Array(32);
      tokenId.set([0x1b, 0x48, 0x76, 0x61], 0); // fastUSDC prefix

      const transaction = {
        sender,
        recipient,
        nonce: 1,
        timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
        claim: {
          TokenTransfer: {
            token_id: tokenId,
            amount: "1000000000000000000", // 1 token with 18 decimals
            user_data: null,
          },
        },
        archival: false,
      };

      // Serialize
      const serialized = TransactionBcs.serialize(transaction).toBytes();
      expect(serialized.length).toBeGreaterThan(0);

      // Deserialize
      const deserialized = TransactionBcs.parse(serialized);
      expect(deserialized.sender).toEqual(sender);
      expect(deserialized.recipient).toEqual(recipient);
      expect(Number(deserialized.nonce)).toBe(1);
      expect(deserialized.archival).toBe(false);
    });
  });

  describe("decodeEnvelope", () => {
    it("decodes a valid TokenTransfer envelope", () => {
      // Create a test transaction
      const sender = new Uint8Array(32).fill(0xaa);
      const recipient = new Uint8Array(32).fill(0xbb);
      const tokenId = new Uint8Array(32);
      tokenId.set([0x1b, 0x48, 0x76, 0x61], 0);

      const transaction = {
        sender,
        recipient,
        nonce: 42,
        timestamp_nanos: BigInt(1709712000000) * 1_000_000n,
        claim: {
          TokenTransfer: {
            token_id: tokenId,
            amount: "5000000000000000000", // 5 tokens
            user_data: null,
          },
        },
        archival: false,
      };

      // Serialize to create envelope
      const envelope = TransactionBcs.serialize(transaction).toBytes();
      const envelopeHex = bytesToHex(envelope);

      // Decode
      const decoded = decodeEnvelope(envelopeHex);

      expect(decoded.sender).toEqual(sender);
      expect(decoded.recipient).toEqual(recipient);
      expect(decoded.nonce).toBe(42n);
      expect(decoded.archival).toBe(false);
      expect(decoded.claim.TokenTransfer).toBeDefined();
    });

    it("throws on invalid hex", () => {
      expect(() => decodeEnvelope("not-valid-hex")).toThrow();
    });

    it("throws on truncated data", () => {
      expect(() => decodeEnvelope("0x0102")).toThrow();
    });
  });

  describe("getTransferDetails", () => {
    it("extracts transfer details from decoded transaction", () => {
      const sender = new Uint8Array(32).fill(0xcc);
      const recipient = new Uint8Array(32).fill(0xdd);
      const tokenId = new Uint8Array(32);
      tokenId.set([0x1b, 0x48, 0x76, 0x61], 0);

      const transaction = {
        sender,
        recipient,
        nonce: 100,
        timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
        claim: {
          TokenTransfer: {
            token_id: tokenId,
            amount: "10000000000000000000", // 10 tokens
            user_data: null,
          },
        },
        archival: false,
      };

      const envelope = TransactionBcs.serialize(transaction).toBytes();
      const decoded = decodeEnvelope(bytesToHex(envelope));
      const details = getTransferDetails(decoded);

      expect(details).not.toBeNull();
      expect(details!.sender).toBe(bytesToHex(sender));
      expect(details!.recipient).toBe(bytesToHex(recipient));
      // Amount is parsed from BCS - check it's a valid bigint
      expect(details!.amount).toBeGreaterThan(0n);
      expect(details!.tokenId).toBe(bytesToHex(tokenId));
    });

    it("returns null for non-TokenTransfer transactions", () => {
      const decoded = {
        sender: new Uint8Array(32),
        recipient: new Uint8Array(32),
        nonce: 0n,
        timestamp_nanos: 0n,
        claim: {
          Mint: {
            token_id: new Uint8Array(32),
            amount: "1000",
          },
        },
        archival: false,
      };

      const details = getTransferDetails(decoded);
      expect(details).toBeNull();
    });
  });
});
