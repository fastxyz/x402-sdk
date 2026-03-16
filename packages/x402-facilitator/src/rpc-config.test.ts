import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PaymentPayload, PaymentRequirement } from "./types.js";
import { initChainConfig } from "./chains.js";
import { verify } from "./verify.js";
import { settle } from "./settle.js";
import * as viem from "viem";

const viemMocks = vi.hoisted(() => {
  const http = vi.fn((url?: string) => ({ url }));
  const createPublicClient = vi.fn();
  const createWalletClient = vi.fn();

  return {
    http,
    createPublicClient,
    createWalletClient,
    publicClient: {
      verifyTypedData: vi.fn(),
      readContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    },
    walletClient: {
      writeContract: vi.fn(),
    },
  };
});

vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    http: viemMocks.http,
    createPublicClient: viemMocks.createPublicClient,
    createWalletClient: viemMocks.createWalletClient,
  };
});

describe("RPC config overrides", () => {
  const configPath = join("/tmp", `x402-facilitator-rpc-config-${process.pid}.json`);
  const customRpcUrl = "https://custom-rpc.example.com";
  const customChainId = 42161;
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

  function createPayload(): PaymentPayload {
    return {
      x402Version: 1,
      scheme: "exact",
      network: "arbitrum-sepolia",
      payload: {
        signature: ("0x" + "11".repeat(64) + "1b") as `0x${string}`,
        authorization: {
          from: "0x1111111111111111111111111111111111111111",
          to: "0x2222222222222222222222222222222222222222",
          value: "100000",
          validAfter: "0",
          validBefore: String(Math.floor(Date.now() / 1000) + 3600),
          nonce: "0x" + "11".repeat(32),
        },
      },
    };
  }

  beforeEach(() => {
    writeFileSync(configPath, JSON.stringify({
      evm: {
        "arbitrum-sepolia": {
          chainId: customChainId,
          rpcUrl: customRpcUrl,
          usdc: {
            address: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
            name: "USD Coin",
            version: "2",
            decimals: 6,
          },
        },
      },
      fast: {},
    }));

    initChainConfig(configPath);

    viemMocks.http.mockClear();
    viemMocks.createPublicClient.mockReset();
    viemMocks.createWalletClient.mockReset();
    viemMocks.publicClient.verifyTypedData.mockReset();
    viemMocks.publicClient.readContract.mockReset();
    viemMocks.publicClient.waitForTransactionReceipt.mockReset();
    viemMocks.walletClient.writeContract.mockReset();

    viemMocks.createPublicClient.mockReturnValue(viemMocks.publicClient);
    viemMocks.createWalletClient.mockReturnValue(viemMocks.walletClient);
    viemMocks.publicClient.verifyTypedData.mockResolvedValue(true);
    viemMocks.publicClient.readContract
      .mockResolvedValueOnce(100000n)
      .mockResolvedValueOnce(false);
    viemMocks.publicClient.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
    viemMocks.walletClient.writeContract.mockResolvedValue("0x" + "12".repeat(32));
  });

  afterEach(() => {
    initChainConfig();
    rmSync(configPath, { force: true });
  });

  it("uses the configured rpcUrl during verification", async () => {
    const result = await verify(createPayload(), requirement);

    expect(result.isValid).toBe(true);
    expect(viemMocks.http).toHaveBeenCalledWith(customRpcUrl);

    const [clientConfig] = vi.mocked(viem.createPublicClient).mock.calls[0];
    expect(clientConfig.transport).toEqual({ url: customRpcUrl });
    expect(clientConfig.chain?.id).toBe(customChainId);

    const [verifyArgs] = viemMocks.publicClient.verifyTypedData.mock.calls[0];
    expect(verifyArgs.domain.chainId).toBe(customChainId);
  });

  it("uses the configured rpcUrl during settlement", async () => {
    const result = await settle(createPayload(), requirement, {
      evmPrivateKey: ("0x" + "22".repeat(32)) as `0x${string}`,
    });

    expect(result.success).toBe(true);
    expect(viemMocks.http).toHaveBeenCalledWith(customRpcUrl);

    const [walletConfig] = vi.mocked(viem.createWalletClient).mock.calls[0];
    expect(walletConfig.transport).toEqual({ url: customRpcUrl });
  });
});
