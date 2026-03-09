/**
 * Tests for payment verification
 */

import { describe, it, expect } from "vitest";
import { verify } from "./verify.js";
import { TransactionBcs, bytesToHex } from "./fast-bcs.js";
import type { PaymentPayload, PaymentRequirement } from "./types.js";

describe("verify", () => {
  describe("Fast payments", () => {
    // Helper to create a valid Fast certificate
    function createFastCertificate(
      recipient: Uint8Array,
      amount: string,
      tokenId: Uint8Array
    ) {
      const sender = new Uint8Array(32).fill(0xaa);
      const transaction = {
        sender,
        recipient,
        nonce: 1,
        timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
        claim: {
          TokenTransfer: {
            token_id: tokenId,
            amount,
            user_data: null,
          },
        },
        archival: false,
      };
      
      const envelope = TransactionBcs.serialize(transaction).toBytes();
      return {
        envelope: bytesToHex(envelope),
        signatures: [
          { committee_member: 0, signature: "0x" + "aa".repeat(64) },
          { committee_member: 1, signature: "0x" + "bb".repeat(64) },
          { committee_member: 2, signature: "0x" + "cc".repeat(64) },
        ],
      };
    }

    const tokenId = new Uint8Array(32);
    tokenId.set([0x1b, 0x48, 0x76, 0x61], 0);

    const recipient = new Uint8Array(32).fill(0xbb);
    const recipientHex = bytesToHex(recipient);

    it("validates a correct Fast payment", async () => {
      const certificate = createFastCertificate(
        recipient,
        "1000000", // 1 USDC (6 decimals)
        tokenId
      );

      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: { transactionCertificate: certificate },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000", // 1 USDC (6 decimals)
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: recipientHex,
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(true);
      expect(result.payer).toBeDefined();
    });

    it("rejects payment with wrong recipient", async () => {
      const wrongRecipient = new Uint8Array(32).fill(0xff);
      const certificate = createFastCertificate(
        wrongRecipient,
        "1000000", // 1 USDC (6 decimals)
        tokenId
      );

      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: { transactionCertificate: certificate },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: recipientHex, // Different from certificate
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("recipient_mismatch");
    });

    it("rejects payment with insufficient amount", async () => {
      const certificate = createFastCertificate(
        recipient,
        "100", // 0.0001 USDC (too little, 6 decimals)
        tokenId
      );

      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: { transactionCertificate: certificate },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000", // 1 USDC required
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: recipientHex,
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("insufficient_amount");
    });

    it("rejects payment with wrong token", async () => {
      const wrongToken = new Uint8Array(32).fill(0x99);
      const certificate = createFastCertificate(
        recipient,
        "1000000", // 1 USDC (6 decimals)
        wrongToken
      );

      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: { transactionCertificate: certificate },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: recipientHex,
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId), // Different from certificate
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("token_mismatch");
    });

    it("rejects missing envelope", async () => {
      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: {
          transactionCertificate: {
            envelope: "",
            signatures: [],
          },
        },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: recipientHex,
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_envelope");
    });

    it("rejects missing signatures", async () => {
      const certificate = createFastCertificate(
        recipient,
        "1000000",
        tokenId
      );
      certificate.signatures = [];

      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: { transactionCertificate: certificate },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: recipientHex,
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("missing_signatures");
    });

    it("rejects wrong scheme", async () => {
      const certificate = createFastCertificate(
        recipient,
        "1000000",
        tokenId
      );

      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "wrong-scheme",
        network: "fast-testnet",
        payload: { transactionCertificate: certificate },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: recipientHex,
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_scheme");
    });

    it("rejects network mismatch", async () => {
      const certificate = createFastCertificate(
        recipient,
        "1000000",
        tokenId
      );

      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "fast-mainnet", // Different network
        payload: { transactionCertificate: certificate },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: recipientHex,
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_network");
    });
  });

  describe("EVM payments", () => {
    it("rejects invalid payload structure", async () => {
      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "arbitrum-sepolia",
        payload: {}, // Missing signature and authorization
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "arbitrum-sepolia",
        maxAmountRequired: "100000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: "0x1234567890123456789012345678901234567890",
        maxTimeoutSeconds: 60,
        asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_payload");
    });

    it("rejects wrong scheme", async () => {
      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "wrong",
        network: "arbitrum-sepolia",
        payload: {
          signature: "0x" + "ab".repeat(65),
          authorization: {
            from: "0x1111111111111111111111111111111111111111",
            to: "0x2222222222222222222222222222222222222222",
            value: "100000",
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 3600),
            nonce: "0x" + "00".repeat(32),
          },
        },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "arbitrum-sepolia",
        maxAmountRequired: "100000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: "0x2222222222222222222222222222222222222222",
        maxTimeoutSeconds: 60,
        asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_scheme");
    });

    it("rejects recipient mismatch", async () => {
      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "arbitrum-sepolia",
        payload: {
          signature: "0x" + "ab".repeat(65),
          authorization: {
            from: "0x1111111111111111111111111111111111111111",
            to: "0x3333333333333333333333333333333333333333", // Wrong recipient
            value: "100000",
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 3600),
            nonce: "0x" + "00".repeat(32),
          },
        },
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "arbitrum-sepolia",
        maxAmountRequired: "100000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: "0x2222222222222222222222222222222222222222",
        maxTimeoutSeconds: 60,
        asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("invalid_exact_evm_payload_recipient_mismatch");
    });
  });

  describe("unsupported networks", () => {
    it("rejects unsupported network type", async () => {
      const payload: PaymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "solana-mainnet", // SVM not supported yet
        payload: {},
      };

      const requirement: PaymentRequirement = {
        scheme: "exact",
        network: "solana-mainnet",
        maxAmountRequired: "100000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: "SomeAddress",
        maxTimeoutSeconds: 60,
        asset: "USDC",
      };

      const result = await verify(payload, requirement);
      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("unsupported_network_type");
    });
  });
});
