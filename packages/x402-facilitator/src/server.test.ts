/**
 * Tests for facilitator server endpoints
 */

import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, it, expect } from "vitest";
import { createFacilitatorRoutes, createFacilitatorServer } from "./server.js";
import { bytesToHex, serializeFastTransaction } from "./fast-bcs.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function rawPublicKey(key: KeyObject): Uint8Array {
  const spki = key.export({ format: "der", type: "spki" });
  if (!Buffer.from(spki).subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)) {
    throw new Error("unexpected_ed25519_spki_prefix");
  }

  return new Uint8Array(Buffer.from(spki).subarray(ED25519_SPKI_PREFIX.length));
}

// Mock Express request/response
function createMockRequest(method: string, path: string, body?: unknown) {
  return {
    method,
    path,
    body: body || {},
  };
}

function createMockResponse() {
  let statusCode = 200;
  let jsonBody: unknown = null;

  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      jsonBody = body;
    },
    getStatus: () => statusCode,
    getJson: () => jsonBody,
  };
}

function createFastCertificate(
  recipient: Uint8Array,
  amountHex: string,
  tokenId: Uint8Array
) {
  const { publicKey: senderPublicKey, privateKey: senderPrivateKey } = generateKeyPairSync("ed25519");
  const sender = rawPublicKey(senderPublicKey);
  const transaction = {
    sender: Array.from(sender),
    recipient: Array.from(recipient),
    nonce: 1,
    timestamp_nanos: (BigInt(Date.now()) * 1_000_000n).toString(),
    claim: {
      TokenTransfer: {
        token_id: Array.from(tokenId),
        amount: amountHex,
        user_data: null,
      },
    },
    archival: false,
  };

  const transactionBytes = serializeFastTransaction(transaction);
  const senderSignature = sign(null, Buffer.from(transactionBytes), senderPrivateKey);

  const signatures: Array<[number[], number[]]> = [];
  for (let i = 0; i < 3; i++) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    signatures.push([
      Array.from(rawPublicKey(publicKey)),
      Array.from(sign(null, Buffer.from(transactionBytes), privateKey)),
    ]);
  }

  return {
    envelope: {
      transaction,
      signature: {
        Signature: Array.from(senderSignature),
      },
    },
    signatures,
  };
}

describe("createFacilitatorRoutes", () => {
  it("creates routes for /verify, /settle, /supported", () => {
    const routes = createFacilitatorRoutes();
    
    expect(routes).toHaveLength(3);
    expect(routes.map(r => r.path)).toContain("/verify");
    expect(routes.map(r => r.path)).toContain("/settle");
    expect(routes.map(r => r.path)).toContain("/supported");
  });
});

describe("GET /supported", () => {
  it("returns supported payment kinds", async () => {
    const routes = createFacilitatorRoutes();
    const supportedRoute = routes.find(r => r.path === "/supported");
    
    const req = createMockRequest("get", "/supported");
    const res = createMockResponse();
    
    await supportedRoute!.handler(req as any, res as any);
    
    const body = res.getJson() as { paymentKinds: unknown[] };
    expect(body.paymentKinds).toBeDefined();
    expect(Array.isArray(body.paymentKinds)).toBe(true);
    expect(body.paymentKinds.length).toBeGreaterThan(0);
    
    // Check structure of first payment kind
    const first = body.paymentKinds[0] as { x402Version: number; scheme: string; network: string };
    expect(first.x402Version).toBe(1);
    expect(first.scheme).toBe("exact");
    expect(first.network).toBeDefined();
  });

  it("includes both EVM and Fast networks", async () => {
    const routes = createFacilitatorRoutes();
    const supportedRoute = routes.find(r => r.path === "/supported");
    
    const req = createMockRequest("get", "/supported");
    const res = createMockResponse();
    
    await supportedRoute!.handler(req as any, res as any);
    
    const body = res.getJson() as { paymentKinds: { network: string }[] };
    const networks = body.paymentKinds.map(k => k.network);
    
    // Check for EVM networks
    expect(networks).toContain("arbitrum-sepolia");
    expect(networks).toContain("base-sepolia");
    
    // Check for Fast networks
    expect(networks).toContain("fast-testnet");
    expect(networks).toContain("fast-mainnet");
  });
});

describe("POST /verify", () => {
  it("returns 400 for missing parameters", async () => {
    const routes = createFacilitatorRoutes();
    const verifyRoute = routes.find(r => r.path === "/verify");
    
    const req = createMockRequest("post", "/verify", {});
    const res = createMockResponse();
    
    await verifyRoute!.handler(req as any, res as any);
    
    expect(res.getStatus()).toBe(400);
    const body = res.getJson() as { isValid: boolean; invalidReason: string };
    expect(body.isValid).toBe(false);
    expect(body.invalidReason).toBe("missing_parameters");
  });

  it("handles base64 encoded payload", async () => {
    const routes = createFacilitatorRoutes();
    const verifyRoute = routes.find(r => r.path === "/verify");
    
    // Create a valid Fast certificate
    const recipient = new Uint8Array(32).fill(0xbb);
    const tokenId = new Uint8Array(32);
    tokenId.set([0x1b, 0x48, 0x76, 0x61], 0);
    const certificate = createFastCertificate(recipient, "1000000000000000000", tokenId);
    
    const payloadObj = {
      x402Version: 1,
      scheme: "exact",
      network: "fast-testnet",
      payload: {
        transactionCertificate: certificate,
      },
    };
    
    // Base64 encode the payload
    const payloadBase64 = Buffer.from(JSON.stringify(payloadObj)).toString("base64");
    
    const req = createMockRequest("post", "/verify", {
      paymentPayload: payloadBase64,
      paymentRequirements: {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: bytesToHex(recipient),
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      },
    });
    const res = createMockResponse();
    
    await verifyRoute!.handler(req as any, res as any);
    
    const body = res.getJson() as { isValid: boolean };
    expect(body.isValid).toBe(true);
  });

  it("handles decoded payload object", async () => {
    const routes = createFacilitatorRoutes();
    const verifyRoute = routes.find(r => r.path === "/verify");
    
    // Create a valid Fast certificate
    const recipient = new Uint8Array(32).fill(0xcc);
    const tokenId = new Uint8Array(32);
    tokenId.set([0x1b, 0x48, 0x76, 0x61], 0);
    const certificate = createFastCertificate(recipient, "2000000000000000000", tokenId);
    
    const req = createMockRequest("post", "/verify", {
      paymentPayload: {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: {
          transactionCertificate: certificate,
        },
      },
      paymentRequirements: {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: bytesToHex(recipient),
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      },
    });
    const res = createMockResponse();
    
    await verifyRoute!.handler(req as any, res as any);
    
    const body = res.getJson() as { isValid: boolean };
    expect(body.isValid).toBe(true);
  });

  it("returns 400 for invalid base64", async () => {
    const routes = createFacilitatorRoutes();
    const verifyRoute = routes.find(r => r.path === "/verify");
    
    const req = createMockRequest("post", "/verify", {
      paymentPayload: "not-valid-base64!!!",
      paymentRequirements: {},
    });
    const res = createMockResponse();
    
    await verifyRoute!.handler(req as any, res as any);
    
    expect(res.getStatus()).toBe(400);
    const body = res.getJson() as { isValid: boolean; invalidReason: string };
    expect(body.isValid).toBe(false);
    expect(body.invalidReason).toBe("invalid_payload_encoding");
  });
});

describe("POST /settle", () => {
  it("returns 400 for missing parameters", async () => {
    const routes = createFacilitatorRoutes();
    const settleRoute = routes.find(r => r.path === "/settle");
    
    const req = createMockRequest("post", "/settle", {});
    const res = createMockResponse();
    
    await settleRoute!.handler(req as any, res as any);
    
    expect(res.getStatus()).toBe(400);
    const body = res.getJson() as { success: boolean; errorReason: string };
    expect(body.success).toBe(false);
    expect(body.errorReason).toBe("missing_parameters");
  });

  it("succeeds for Fast (no-op settlement)", async () => {
    const routes = createFacilitatorRoutes();
    const settleRoute = routes.find(r => r.path === "/settle");
    
    // Create a valid Fast certificate
    const recipient = new Uint8Array(32).fill(0xee);
    const tokenId = new Uint8Array(32);
    tokenId.set([0x1b, 0x48, 0x76, 0x61], 0);
    const certificate = createFastCertificate(recipient, "3000000000000000000", tokenId);
    
    const req = createMockRequest("post", "/settle", {
      paymentPayload: {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: {
          transactionCertificate: certificate,
        },
      },
      paymentRequirements: {
        scheme: "exact",
        network: "fast-testnet",
        maxAmountRequired: "1000000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: bytesToHex(recipient),
        maxTimeoutSeconds: 60,
        asset: bytesToHex(tokenId),
      },
    });
    const res = createMockResponse();
    
    await settleRoute!.handler(req as any, res as any);
    
    const body = res.getJson() as { success: boolean; transaction?: string };
    expect(body.success).toBe(true);
    expect(body.transaction).toBeDefined();
  });

  it("fails for EVM without private key configured", async () => {
    const routes = createFacilitatorRoutes(); // No evmPrivateKey
    const settleRoute = routes.find(r => r.path === "/settle");
    
    const req = createMockRequest("post", "/settle", {
      paymentPayload: {
        x402Version: 1,
        scheme: "exact",
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
      },
      paymentRequirements: {
        scheme: "exact",
        network: "arbitrum-sepolia",
        maxAmountRequired: "100000",
        resource: "/api/data",
        description: "Test",
        mimeType: "application/json",
        payTo: "0x2222222222222222222222222222222222222222",
        maxTimeoutSeconds: 60,
        asset: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
      },
    });
    const res = createMockResponse();
    
    await settleRoute!.handler(req as any, res as any);
    
    const body = res.getJson() as { success: boolean; errorReason?: string };
    expect(body.success).toBe(false);
    // Either verification fails or settlement fails due to no key
    expect(body.errorReason).toBeDefined();
  });
});

describe("createFacilitatorServer", () => {
  it("creates middleware that handles routes", async () => {
    const middleware = createFacilitatorServer();
    
    const req = createMockRequest("get", "/supported");
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    
    await middleware(req as any, res as any, next);
    
    expect(nextCalled).toBe(false);
    const body = res.getJson() as { paymentKinds: unknown[] };
    expect(body.paymentKinds).toBeDefined();
  });

  it("calls next() for non-matching routes", async () => {
    const middleware = createFacilitatorServer();
    
    const req = createMockRequest("get", "/unknown-route");
    const res = createMockResponse();
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    
    await middleware(req as any, res as any, next);
    
    expect(nextCalled).toBe(true);
  });
});
