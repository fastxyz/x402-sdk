/**
 * EVM payment handler for x402 using EIP-3009 transferWithAuthorization
 * 
 * Includes auto-bridge from Fast when EVM USDC balance is insufficient.
 */

import { createPublicClient, defineChain, http, erc20Abi, type Chain } from 'viem';
import { arbitrumSepolia, arbitrum, sepolia, mainnet, base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import type { 
  EvmWallet, 
  FastWallet,
  PaymentRequired, 
  PaymentRequirement, 
  X402PayResult,
  Eip3009Authorization 
} from './types.js';
import { bridgeFastusdcToUsdc, getFastBalance, getBridgeConfig } from './bridge.js';

/**
 * Network configuration
 */
interface NetworkConfig {
  chain: Chain;
  network: 'testnet' | 'mainnet';
  chainId: number;
  rpcUrl?: string;
}

const NETWORK_MAP: Record<string, NetworkConfig> = {
  'arbitrum-sepolia': { chain: arbitrumSepolia, network: 'testnet', chainId: 421614 },
  'arbitrum': { chain: arbitrum, network: 'mainnet', chainId: 42161 },
  'ethereum-sepolia': { chain: sepolia, network: 'testnet', chainId: 11155111 },
  'ethereum': { chain: mainnet, network: 'mainnet', chainId: 1 },
  // Note: Base mainnet uses allset-sdk 'testnet' config (for bridge support)
  'base': { chain: base, network: 'testnet', chainId: 8453 },
};

export const EVM_NETWORKS = Object.keys(NETWORK_MAP);

function buildCustomNetworkConfig(requirement: PaymentRequirement): NetworkConfig | null {
  const chainId = requirement.extra?.chainId;
  const rpcUrl = requirement.extra?.rpcUrl;

  if (
    typeof chainId !== 'number' ||
    !Number.isInteger(chainId) ||
    typeof rpcUrl !== 'string' ||
    rpcUrl.length === 0
  ) {
    return null;
  }

  return {
    chain: defineChain({
      id: chainId,
      name: requirement.network,
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: {
          http: [rpcUrl],
        },
      },
    }),
    network: requirement.network.endsWith('-sepolia') ? 'testnet' : 'mainnet',
    chainId,
    rpcUrl,
  };
}

function getNetworkConfig(requirement: PaymentRequirement): NetworkConfig | null {
  return NETWORK_MAP[requirement.network] ?? buildCustomNetworkConfig(requirement);
}

export function canHandleEvmPayment(requirement: PaymentRequirement): boolean {
  return getNetworkConfig(requirement) !== null;
}

/**
 * Get EVM USDC balance
 */
async function getEvmUsdcBalance(
  address: `0x${string}`,
  usdcAddress: `0x${string}`,
  chain: Chain,
  rpcUrl?: string
): Promise<bigint> {
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  try {
    const balance = await client.readContract({
      address: usdcAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    });
    return balance;
  } catch {
    return 0n;
  }
}

/**
 * Poll for USDC balance to reach target
 */
async function pollForBalance(
  address: `0x${string}`,
  usdcAddress: `0x${string}`,
  chain: Chain,
  rpcUrl: string | undefined,
  targetAmount: bigint,
  maxWaitMs: number = 1200000,  // 20 minutes for slow chains like Ethereum
  pollIntervalMs: number = 1000,
  log: (msg: string) => void = () => {}
): Promise<{ arrived: boolean; balance: bigint }> {
  const startTime = Date.now();
  let pollCount = 0;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    pollCount++;
    
    const balance = await getEvmUsdcBalance(address, usdcAddress, chain, rpcUrl);
    log(`  [Poll ${pollCount}] Balance: ${Number(balance) / 1e6} USDC (need ${Number(targetAmount) / 1e6})`);
    
    if (balance >= targetAmount) {
      return { arrived: true, balance };
    }
  }

  return { arrived: false, balance: 0n };
}

/**
 * Handle x402 payment on EVM networks using EIP-3009
 * 
 * With auto-bridge: if EVM USDC balance is insufficient and a Fast wallet
 * is provided, automatically bridges fastUSDC → USDC via AllSet.
 */
export async function handleEvmPayment(
  url: string,
  method: string,
  customHeaders: Record<string, string>,
  requestBody: string | undefined,
  paymentRequired: PaymentRequired,
  evmReq: PaymentRequirement,
  wallet: EvmWallet,
  verbose: boolean = false,
  logs: string[] = [],
  fastWallet?: FastWallet
): Promise<X402PayResult> {
  const log = (msg: string) => { 
    if (verbose) { 
      logs.push(`[${new Date().toISOString()}] ${msg}`); 
      logs.push(''); 
    } 
  };

  log(`━━━ EVM Payment Handler START ━━━`);
  log(`  Network: ${evmReq.network}`);
  log(`  Amount: ${evmReq.maxAmountRequired} (raw) = ${Number(evmReq.maxAmountRequired) / 1e6} USDC`);
  log(`  Recipient: ${evmReq.payTo}`);
  log(`  Asset (USDC): ${evmReq.asset}`);
  log(`  Fast wallet available: ${fastWallet ? 'yes' : 'no'}`);

  // Get network config
  const networkConfig = getNetworkConfig(evmReq);
  if (!networkConfig) {
    throw new Error(
      `Unsupported EVM network: ${evmReq.network}. ` +
      `Built-in networks: ${EVM_NETWORKS.join(', ')}. ` +
      `Custom networks require paymentRequirement.extra.chainId and paymentRequirement.extra.rpcUrl.`
    );
  }
  log(`  Chain ID: ${networkConfig.chainId}`);

  // Create account from wallet
  const account = privateKeyToAccount(wallet.privateKey);
  log(`  Payer address: ${account.address}`);

  // Validate USDC address
  const usdcAddress = evmReq.asset as `0x${string}`;
  if (!usdcAddress) {
    throw new Error('No USDC asset address in payment requirements');
  }

  const requiredAmount = BigInt(evmReq.maxAmountRequired);
  let bridged = false;
  let bridgeTxHash: string | undefined;
  const fastTokenSymbol = networkConfig.network === 'mainnet' ? 'fastUSDC' : 'testUSDC';

  // ─── Auto-Bridge Logic ──────────────────────────────────────────────────────
  log(`[EVM] Checking USDC balance...`);
  let currentBalance = await getEvmUsdcBalance(
    account.address,
    usdcAddress,
    networkConfig.chain,
    networkConfig.rpcUrl
  );
  log(`  Current balance: ${Number(currentBalance) / 1e6} USDC`);
  log(`  Required: ${Number(requiredAmount) / 1e6} USDC`);

  if (currentBalance < requiredAmount) {
    log(`  ⚠ Insufficient balance!`);

    if (!fastWallet) {
      throw new Error(
        `Insufficient USDC balance: have ${Number(currentBalance) / 1e6}, need ${Number(requiredAmount) / 1e6}. ` +
        `Provide a Fast wallet with ${fastTokenSymbol} to enable auto-bridge.`
      );
    }

    // Check if this network supports bridging
    const bridgeConfig = getBridgeConfig(evmReq.network);
    if (!bridgeConfig) {
      throw new Error(
        `Insufficient USDC balance and auto-bridge not supported for ${evmReq.network}`
      );
    }

    // Check Fast bridge-token balance on the matching Fast network
    log(`[EVM] Checking Fast ${fastTokenSymbol} balance...`);
    const fastBalance = await getFastBalance(fastWallet, networkConfig.network);
    log(`  Fast ${fastTokenSymbol} balance: ${Number(fastBalance) / 1e6}`);

    const shortfall = requiredAmount - currentBalance;
    if (fastBalance < shortfall) {
      throw new Error(
        `Insufficient balance for payment. ` +
        `EVM USDC: ${Number(currentBalance) / 1e6}, Fast ${fastTokenSymbol}: ${Number(fastBalance) / 1e6}, ` +
        `Need: ${Number(requiredAmount) / 1e6}`
      );
    }

    // Bridge the shortfall amount
    log(`[EVM] Auto-bridging ${Number(shortfall) / 1e6} ${fastTokenSymbol} → USDC via AllSet...`);
    const bridgeStartTime = Date.now();
    
    const bridgeResult = await bridgeFastusdcToUsdc({
      fastWallet,
      evmReceiverAddress: account.address,
      amount: shortfall,
      network: evmReq.network,
      verbose,
      logs,
    });

    if (!bridgeResult.success) {
      throw new Error(`Auto-bridge failed: ${bridgeResult.error}`);
    }

    bridged = true;
    bridgeTxHash = bridgeResult.txHash;
    log(`  ✓ Bridge submitted: ${bridgeTxHash}`);

    // Poll for USDC arrival
    log(`[EVM] Waiting for USDC to arrive...`);
    const pollResult = await pollForBalance(
      account.address,
      usdcAddress,
      networkConfig.chain,
      networkConfig.rpcUrl,
      requiredAmount,
      120000, // 2 minutes
      3000,   // 3 seconds
      log
    );

    if (!pollResult.arrived) {
      throw new Error(
        `Bridge submitted (${bridgeTxHash}) but USDC has not arrived after 2 minutes. ` +
        `The bridge may still be processing. Check your balance later and retry.`
      );
    }

    const bridgeDuration = Date.now() - bridgeStartTime;
    currentBalance = pollResult.balance;
    log(`  ✓ USDC arrived in ${bridgeDuration}ms`);
    log(`  New balance: ${Number(currentBalance) / 1e6} USDC`);
  } else {
    log(`  ✓ Sufficient balance`);
  }

  // ─── EIP-3009 Authorization ─────────────────────────────────────────────────
  log(`[EVM] Building EIP-3009 transferWithAuthorization...`);
  const authorization: Eip3009Authorization = {
    from: account.address,
    to: evmReq.payTo as `0x${string}`,
    value: evmReq.maxAmountRequired,
    validAfter: '0',
    validBefore: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour
    nonce: ('0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')) as `0x${string}`,
  };
  log(`  Authorization: ${JSON.stringify(authorization, null, 2)}`);

  // EIP-712 domain
  const usdcName = evmReq.extra?.name ?? 'USD Coin';
  const usdcVersion = evmReq.extra?.version ?? '2';
  const domain = {
    name: usdcName,
    version: usdcVersion,
    chainId: networkConfig.chainId,
    verifyingContract: usdcAddress,
  };
  log(`  Domain: ${JSON.stringify(domain)}`);

  // EIP-712 types
  const authorizationTypes = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  // Sign the authorization
  log(`[EVM] Signing EIP-712 typed data...`);
  const signature = await account.signTypedData({
    domain,
    types: authorizationTypes,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });
  log(`  Signature: ${signature.slice(0, 20)}...`);

  // Build x402 payment payload
  log(`[EVM] Building x402 payment payload...`);
  const paymentPayload = {
    x402Version: paymentRequired.x402Version ?? 1,
    scheme: 'exact',
    network: evmReq.network,
    payload: {
      signature,
      authorization,
    },
  };

  const payloadBase64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  log(`  Payload base64 length: ${payloadBase64.length}`);

  // Retry request with X-PAYMENT header
  log(`[EVM] Sending paid request with X-PAYMENT header...`);
  const paidRes = await fetch(url, {
    method,
    headers: { ...customHeaders, 'X-PAYMENT': payloadBase64 },
    body: requestBody,
  });
  log(`  Response: ${paidRes.status} ${paidRes.statusText}`);

  const resHeaders: Record<string, string> = {};
  paidRes.headers.forEach((v, k) => { resHeaders[k] = v; });

  let resBody: unknown;
  try { resBody = await paidRes.json(); } catch { resBody = await paidRes.text(); }

  // Extract txHash from response if available
  let settleTxHash = signature.slice(0, 66);
  if (typeof resBody === 'object' && resBody !== null) {
    const rb = resBody as Record<string, unknown>;
    if (typeof rb.txHash === 'string') {
      settleTxHash = rb.txHash;
    }
  }

  const amountHuman = (Number(evmReq.maxAmountRequired) / 1e6).toString();
  const bridgeNote = bridged ? ` (auto-bridged ${bridgeTxHash?.slice(0, 10)}...)` : '';

  log(`━━━ EVM Payment Handler END ━━━`);
  log(`  Success: ${paidRes.ok}`);
  log(`  Amount: ${amountHuman} USDC`);
  log(`  Bridged: ${bridged}`);

  return {
    success: paidRes.ok,
    statusCode: paidRes.status,
    headers: resHeaders,
    body: resBody,
    payment: {
      network: evmReq.network,
      amount: amountHuman,
      recipient: evmReq.payTo,
      txHash: settleTxHash,
      bridged,
      bridgeTxHash,
    },
    note: paidRes.ok
      ? `EVM payment of ${amountHuman} USDC successful${bridgeNote}. Content delivered.`
      : `Payment signed but server returned ${paidRes.status}.`,
    logs: verbose ? logs : undefined,
  };
}
