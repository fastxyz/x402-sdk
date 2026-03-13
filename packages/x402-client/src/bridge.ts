/**
 * AllSet bridge integration for x402-client
 *
 * Uses @fastxyz/allset-sdk for bridging fastUSDC/testUSDC from Fast to USDC on EVM chains.
 * Accepts both FastWallet class instances and simple config objects.
 */

import { FastProvider, FastWallet as FastWalletClass } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk';
import type { FastWallet, FastWalletConfig } from './types.js';
import { isFastWalletClass } from './types.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BridgeResult {
  success: boolean;
  txHash?: string;
  evmTxHash?: string;
  error?: string;
}

export interface BridgeParams {
  fastWallet: FastWallet;
  evmReceiverAddress: string;
  amount: bigint;
  network: string;
  verbose?: boolean;
  logs?: string[];
}

export interface BridgeConfig {
  chainId: number;
  usdcAddress: string;
  fastBridgeAddress: string;
  relayerUrl: string;
  bridgeContract?: string;
}

// ─── Network Mapping ──────────────────────────────────────────────────────────

/**
 * Map x402 EVM network name to AllSet chain name
 */
function mapEvmNetworkToChain(network: string): string {
  const mapping: Record<string, string> = {
    'arbitrum-sepolia': 'arbitrum',
    'ethereum-sepolia': 'ethereum',
  };
  return mapping[network] ?? network;
}

/**
 * Map x402 network to SDK network type
 */
function mapToSdkNetwork(network: string): 'testnet' | 'mainnet' {
  if (network.includes('mainnet')) return 'mainnet';
  return 'testnet';
}

/**
 * Get token symbol for bridging based on network
 */
function getBridgeToken(network: string): string {
  // On testnet, use testUSDC; on mainnet, use fastUSDC
  if (network.includes('mainnet')) return 'fastUSDC';
  return 'testUSDC';
}

// ─── Bridge Config ────────────────────────────────────────────────────────────

/**
 * Get bridge configuration for a network using AllSetProvider
 */
export function getBridgeConfig(network: string): BridgeConfig | null {
  const chain = mapEvmNetworkToChain(network);
  const sdkNetwork = mapToSdkNetwork(network);

  try {
    const allset = new AllSetProvider({ network: sdkNetwork });
    const chainConfig = allset.getChainConfig(chain);
    if (!chainConfig) return null;

    const tokenConfig = allset.getTokenConfig(chain, 'USDC');
    if (!tokenConfig) return null;

    return {
      chainId: chainConfig.chainId,
      usdcAddress: tokenConfig.evmAddress,
      fastBridgeAddress: chainConfig.fastBridgeAddress,
      relayerUrl: chainConfig.relayerUrl,
      bridgeContract: chainConfig.bridgeContract,
    };
  } catch {
    return null;
  }
}

// ─── Balance Check ────────────────────────────────────────────────────────────

/**
 * Get Fast balance for fastUSDC/testUSDC
 *
 * @param wallet - FastWallet class or simple config
 * @returns Balance in raw units (6 decimals)
 */
export async function getFastBalance(wallet: FastWallet): Promise<bigint> {
  let address: string;
  let rpcUrl: string | undefined;

  if (isFastWalletClass(wallet)) {
    address = wallet.address;
    // FastWallet class doesn't expose rpcUrl directly, use default
    rpcUrl = undefined;
  } else {
    const config = wallet as FastWalletConfig;
    address = config.address;
    rpcUrl = config.rpcUrl;
  }

  const sdkNetwork = rpcUrl?.includes('mainnet') ? 'mainnet' : 'testnet';
  const token = sdkNetwork === 'mainnet' ? 'fastUSDC' : 'testUSDC';

  const provider = new FastProvider({
    network: sdkNetwork,
    rpcUrl,
  });

  const balance = await provider.getBalance(address, token);

  // Convert human-readable balance to raw units (6 decimals)
  const parts = balance.amount.split('.');
  const intPart = parts[0] || '0';
  const fracPart = (parts[1] || '').padEnd(6, '0').slice(0, 6);
  return BigInt(intPart + fracPart);
}

// ─── Bridge Operation ─────────────────────────────────────────────────────────

/**
 * Bridge fastUSDC/testUSDC from Fast to USDC on EVM chain
 *
 * @param params - Bridge parameters (accepts FastWallet class or config)
 * @returns Bridge result
 */
export async function bridgeFastusdcToUsdc(params: BridgeParams): Promise<BridgeResult> {
  const { fastWallet, evmReceiverAddress, amount, network, verbose = false, logs = [] } = params;

  const log = (msg: string) => {
    if (verbose) {
      logs.push(`[${new Date().toISOString()}] [Bridge] ${msg}`);
      logs.push('');
    }
  };

  const chain = mapEvmNetworkToChain(network);
  const sdkNetwork = mapToSdkNetwork(network);
  const token = getBridgeToken(network);

  // Resolve wallet
  let sdkFastWallet: FastWalletClass;
  let walletAddress: string;

  if (isFastWalletClass(fastWallet)) {
    sdkFastWallet = fastWallet;
    walletAddress = fastWallet.address;
  } else {
    const config = fastWallet as FastWalletConfig;
    const fastProvider = new FastProvider({
      network: sdkNetwork,
      rpcUrl: config.rpcUrl,
    });
    sdkFastWallet = await FastWalletClass.fromPrivateKey(config.privateKey, fastProvider);
    walletAddress = config.address;
  }

  log(`━━━ AllSet Bridge START ━━━`);
  log(`  Amount: ${Number(amount) / 1e6} ${token}`);
  log(`  From: ${walletAddress}`);
  log(`  To: ${evmReceiverAddress} on ${network}`);
  log(`  Using @fastxyz/allset-sdk`);

  try {
    const allset = new AllSetProvider({ network: sdkNetwork });

    log(`[Bridge] Executing sendToExternal via AllSet...`);
    const startTime = Date.now();

    // Execute bridge via AllSet
    const result = await allset.sendToExternal({
      chain,
      token,
      amount: amount.toString(),
      from: sdkFastWallet.address,
      to: evmReceiverAddress,
      fastWallet: sdkFastWallet,
    });

    const duration = Date.now() - startTime;
    log(`  ✓ Bridge completed in ${duration}ms`);
    log(`  Fast txHash: ${result.txHash}`);
    log(`  Order ID: ${result.orderId}`);
    log(`━━━ AllSet Bridge END ━━━`);

    return {
      success: true,
      txHash: result.txHash,
      evmTxHash: result.orderId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`  ✗ Bridge failed: ${errorMsg}`);
    log(`━━━ AllSet Bridge END (error) ━━━`);

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Check if auto-bridge is available for a network
 */
export function canAutoBridge(evmNetwork: string): boolean {
  const config = getBridgeConfig(evmNetwork);
  return config !== null;
}
