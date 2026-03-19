/**
 * Tests for facilitator server endpoints
 */

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { createFacilitatorRoutes, createFacilitatorServer } from "./server.js";
import { TransactionBcs, bytesToHex } from "./fast-bcs.js";

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
    expect(networks).toContain("ethereum-sepolia");
    
    // Check for Fast networks
    expect(networks).toContain("fast-testnet");
    expect(networks).toContain("fast-mainnet");
  });

  it("keeps custom config isolated per route instance", async () => {
    const configAPath = join("/tmp", `x402-fac-config-a-${process.pid}.json`);
    const configBPath = join("/tmp", `x402-fac-config-b-${process.pid}.json`);

    writeFileSync(configAPath, JSON.stringify({
      evm: {
        "arbitrum-sepolia": {
          chainId: 421614,
          rpcUrl: "https://a.example/rpc",
          usdc: {
            address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            name: "USD Coin A",
            version: "2",
            decimals: 6,
          },
        },
      },
      fast: {
        "fast-testnet": {
          rpcUrl: "https://fast-a.example/rpc",
        },
      },
    }));

    writeFileSync(configBPath, JSON.stringify({
      evm: {
        "arbitrum-sepolia": {
          chainId: 421614,
          rpcUrl: "https://b.example/rpc",
          usdc: {
            address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            name: "USD Coin B",
            version: "2",
            decimals: 6,
          },
        },
      },
      fast: {
        "fast-testnet": {
          rpcUrl: "https://fast-b.example/rpc",
        },
      },
    }));

    try {
      const routesA = createFacilitatorRoutes({ configPath: configAPath });
      const routesB = createFacilitatorRoutes({ configPath: configBPath });
      const supportedRouteA = routesA.find(r => r.path === "/supported");
      const supportedRouteB = routesB.find(r => r.path === "/supported");

      const req = createMockRequest("get", "/supported");
      const resA = createMockResponse();
      const resB = createMockResponse();

      await supportedRouteA!.handler(req as any, resA as any);
      await supportedRouteB!.handler(req as any, resB as any);

      const paymentKindsA = (resA.getJson() as { paymentKinds: Array<{ network: string; extra?: { asset?: string } }> }).paymentKinds;
      const paymentKindsB = (resB.getJson() as { paymentKinds: Array<{ network: string; extra?: { asset?: string } }> }).paymentKinds;

      expect(paymentKindsA.find(kind => kind.network === "arbitrum-sepolia")?.extra?.asset)
        .toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      expect(paymentKindsB.find(kind => kind.network === "arbitrum-sepolia")?.extra?.asset)
        .toBe("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    } finally {
      rmSync(configAPath, { force: true });
      rmSync(configBPath, { force: true });
    }
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
    
    const transaction = {
      sender: new Uint8Array(32).fill(0xaa),
      recipient,
      nonce: 1,
      timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
      claim: {
        TokenTransfer: {
          token_id: tokenId,
          amount: "1000000000000000000",
          user_data: null,
        },
      },
      archival: false,
    };
    
    const envelope = bytesToHex(TransactionBcs.serialize(transaction).toBytes());
    
    const payloadObj = {
      x402Version: 1,
      scheme: "exact",
      network: "fast-testnet",
      payload: {
        transactionCertificate: {
          envelope,
          signatures: [
            { committee_member: 0, signature: "0x" + "aa".repeat(64) },
          ],
        },
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
    
    const transaction = {
      sender: new Uint8Array(32).fill(0xdd),
      recipient,
      nonce: 2,
      timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
      claim: {
        TokenTransfer: {
          token_id: tokenId,
          amount: "2000000000000000000",
          user_data: null,
        },
      },
      archival: false,
    };
    
    const envelope = bytesToHex(TransactionBcs.serialize(transaction).toBytes());
    
    const req = createMockRequest("post", "/verify", {
      paymentPayload: {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: {
          transactionCertificate: {
            envelope,
            signatures: [
              { committee_member: 0, signature: "0x" + "aa".repeat(64) },
            ],
          },
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
    
    const transaction = {
      sender: new Uint8Array(32).fill(0xff),
      recipient,
      nonce: 3,
      timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
      claim: {
        TokenTransfer: {
          token_id: tokenId,
          amount: "3000000000000000000",
          user_data: null,
        },
      },
      archival: false,
    };
    
    const envelope = bytesToHex(TransactionBcs.serialize(transaction).toBytes());
    
    const req = createMockRequest("post", "/settle", {
      paymentPayload: {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: {
          transactionCertificate: {
            envelope,
            signatures: [
              { committee_member: 0, signature: "0x" + "aa".repeat(64) },
            ],
          },
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

  it("succeeds for Fast object-envelope certificates", async () => {
    const routes = createFacilitatorRoutes();
    const settleRoute = routes.find(r => r.path === "/settle");

    const recipient = new Uint8Array(32).fill(0xab);
    const tokenId = new Uint8Array(32);
    tokenId.set([0x1b, 0x48, 0x76, 0x61], 0);

    const transaction = {
      sender: new Uint8Array(32).fill(0xcd),
      recipient,
      nonce: 4,
      timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
      claim: {
        TokenTransfer: {
          token_id: tokenId,
          amount: "4000000000000000000",
          user_data: null,
        },
      },
      archival: false,
    };

    const req = createMockRequest("post", "/settle", {
      paymentPayload: {
        x402Version: 1,
        scheme: "exact",
        network: "fast-testnet",
        payload: {
          transactionCertificate: {
            envelope: {
              transaction: {
                Release20260303: transaction,
              },
              signature: {
                Signature: Array(64).fill(0xaa),
              },
            },
            signatures: [
              { committee_member: 0, signature: "0x" + "aa".repeat(64) },
            ],
          },
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
    expect(body.transaction).toMatch(/^0x/);
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
