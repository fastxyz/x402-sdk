/**
 * AllSet bridge integration for x402-client
 * 
 * Bridges USDC/testUSDC from Fast to USDC on EVM chains when needed.
 * Uses @fastxyz/allset-sdk for bridge operations.
 */

import { AllSetProvider } from '@fastxyz/allset-sdk/node';
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import type { FastWallet as X402FastWallet } from './types.js';
import { normalizeEvmNetwork } from './networks.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Fast RPC URLs */
const FAST_RPC_URLS = {
  testnet: 'https://testnet.api.fast.xyz/proxy',
  mainnet: 'https://api.fast.xyz/proxy',
} as const;

/** USDC token ID on Fast mainnet */
const MAINNET_USDC_TOKEN_ID = 'c655a12330da6af361d281b197996d2bc135aaed3b66278e729c2222291e9130';

/** testUSDC token ID on Fast testnet */
const TESTNET_USDC_TOKEN_ID = 'd73a0679a2be46981e2a8aedecd951c8b6690e7d5f8502b34ed3ff4cc2163b46';

// ─── Cached Providers ─────────────────────────────────────────────────────────

const allsetProviders: Record<string, AllSetProvider> = {};
const fastProviders: Record<string, FastProvider> = {};

function getAllSetProvider(network: 'testnet' | 'mainnet' = 'testnet'): AllSetProvider {
  if (!allsetProviders[network]) {
    allsetProviders[network] = new AllSetProvider({ network });
  }
  return allsetProviders[network];
}

function getFastProvider(network: 'testnet' | 'mainnet' = 'testnet'): FastProvider {
  if (!fastProviders[network]) {
    fastProviders[network] = new FastProvider({ 
      rpcUrl: FAST_RPC_URLS[network],
      network,
    });
  }
  return fastProviders[network];
}

// ─── Public Types ─────────────────────────────────────────────────────────────

/** Bridge configuration per EVM chain */
export interface BridgeChainConfig {
  chainId: number;
  usdcAddress: string;
  fastBridgeAddress: string;
  relayerUrl: string;
  bridgeContract?: string;
}

export interface BridgeParams {
  /** Fast wallet with USDC/testUSDC */
  fastWallet: X402FastWallet;
  /** EVM address to receive USDC */
  evmReceiverAddress: string;
  /** Amount to bridge (raw, 6 decimals) */
  amount: bigint;
  /** Target EVM network (e.g., 'arbitrum-sepolia') */
  network: string;
  /** Verbose logging */
  verbose?: boolean;
  /** Log collector */
  logs?: string[];
}

export interface BridgeResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

interface BridgeNetworkContext {
  normalizedNetwork: string;
  allsetProviderNetwork: 'testnet' | 'mainnet';
  fastNetwork: 'testnet' | 'mainnet';
  tokenName: 'USDC' | 'testUSDC';
}

export function resolveBridgeNetworkContext(network: string): BridgeNetworkContext {
  const normalizedNetwork = normalizeEvmNetwork(network) ?? network;
  const isSepolia = normalizedNetwork.includes('sepolia');

  return {
    normalizedNetwork,
    allsetProviderNetwork: isSepolia ? 'testnet' : 'mainnet',
    fastNetwork: isSepolia ? 'testnet' : 'mainnet',
    tokenName: isSepolia ? 'testUSDC' : 'USDC',
  };
}

// ─── Public Functions ─────────────────────────────────────────────────────────

/**
 * Get bridge configuration for a network.
 * Configurations are loaded from @fastxyz/allset-sdk.
 */
export function getBridgeConfig(network: string): BridgeChainConfig | null {
  const { normalizedNetwork, allsetProviderNetwork } = resolveBridgeNetworkContext(network);
  const allset = getAllSetProvider(allsetProviderNetwork);

  const chainConfig = allset.getChainConfig(normalizedNetwork);
  if (!chainConfig) return null;

  const tokenConfig = allset.getTokenConfig(normalizedNetwork, 'USDC');
  if (!tokenConfig) return null;
  
  return {
    chainId: chainConfig.chainId,
    usdcAddress: tokenConfig.evmAddress,
    fastBridgeAddress: chainConfig.fastBridgeAddress,
    relayerUrl: chainConfig.relayerUrl,
    bridgeContract: chainConfig.bridgeContract,
  };
}

/**
 * Get USDC/testUSDC balance on Fast network.
 * Uses @fastxyz/sdk's FastProvider.
 */
export async function getFastBalance(wallet: X402FastWallet): Promise<bigint> {
  const isTestnet = !wallet.rpcUrl || wallet.rpcUrl.includes('testnet');
  const provider = getFastProvider(isTestnet ? 'testnet' : 'mainnet');
  
  try {
    const accountInfo = await provider.getAccountInfo(wallet.address);
    if (!accountInfo?.token_balance) return 0n;

    // Check for both mainnet USDC and testnet testUSDC
    for (const [tokenId, hexAmount] of accountInfo.token_balance) {
      const tokenHex = Buffer.from(tokenId).toString('hex');
      if (tokenHex === MAINNET_USDC_TOKEN_ID || tokenHex === TESTNET_USDC_TOKEN_ID) {
        return BigInt('0x' + hexAmount);
      }
    }
    return 0n;
  } catch {
    return 0n;
  }
}

/**
 * Bridge USDC/testUSDC from Fast to USDC on EVM via AllSet.
 * Uses @fastxyz/allset-sdk's sendToExternal().
 */
export async function bridgeFastusdcToUsdc(params: BridgeParams): Promise<BridgeResult> {
  const { fastWallet, evmReceiverAddress, amount, network, verbose = false, logs = [] } = params;
  const { normalizedNetwork, allsetProviderNetwork, fastNetwork, tokenName } = resolveBridgeNetworkContext(network);
  
  const log = (msg: string) => {
    if (verbose) {
      logs.push(`[${new Date().toISOString()}] [Bridge] ${msg}`);
      logs.push('');
    }
  };

  log(`━━━ AllSet Bridge START ━━━`);
  log(`  Amount: ${Number(amount) / 1e6} ${tokenName}`);
  log(`  From: ${fastWallet.address}`);
  log(`  To: ${evmReceiverAddress} on ${normalizedNetwork}`);
  log(`  Using: @fastxyz/allset-sdk sendToExternal()`);

  try {
    // Get AllSet provider
    const allset = getAllSetProvider(allsetProviderNetwork);
    
    // Get Fast provider for the wallet
    const fastProvider = getFastProvider(fastNetwork);
    
    // Create a FastWallet from raw keys using @fastxyz/sdk
    log(`[Step 1] Creating FastWallet from keys...`);
    const sdkFastWallet = await FastWallet.fromPrivateKey(
      fastWallet.privateKey,
      fastProvider
    );
    log(`  ✓ FastWallet created: ${sdkFastWallet.address}`);
    
    // Verify address matches
    if (sdkFastWallet.address !== fastWallet.address) {
      throw new Error(
        `Address mismatch: expected ${fastWallet.address}, got ${sdkFastWallet.address}`
      );
    }

    // Call allset-sdk's sendToExternal
    log(`[Step 2] Calling allset.sendToExternal()...`);
    const result = await allset.sendToExternal({
      chain: normalizedNetwork,
      token: tokenName,
      amount: amount.toString(),
      from: fastWallet.address,
      to: evmReceiverAddress,
      fastWallet: sdkFastWallet,
    });
    
    log(`  ✓ Bridge submitted: ${result.txHash}`);
    log(`  Order ID: ${result.orderId}`);
    log(`  Estimated time: ${result.estimatedTime}`);
    log(`━━━ AllSet Bridge END ━━━`);

    return {
      success: true,
      txHash: result.txHash,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`  ✗ Bridge failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}
