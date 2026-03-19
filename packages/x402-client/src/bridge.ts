/**
 * AllSet bridge integration for x402-client
 *
 * Uses @fastxyz/allset-sdk for bridging fastUSDC/testUSDC from Fast to USDC on EVM chains.
 */

import type { FastWallet } from '@fastxyz/sdk';
import { AllSetProvider } from '@fastxyz/allset-sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BridgeResult {
  success: boolean;
  /** Fast transaction hash returned by AllSet. */
  txHash?: string;
  /** AllSet bridge order id for tracking the external transfer. */
  orderId?: string;
  error?: string;
}

export interface BridgeParams {
  fastWallet: FastWallet;
  evmReceiverAddress: string;
  amount: bigint;
  network: string;
  sdkNetwork?: 'testnet' | 'mainnet';
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
  switch (network) {
    case 'arbitrum-sepolia':
    case 'ethereum-sepolia':
    case 'fast-testnet':
      return 'testnet';
    case 'arbitrum':
    case 'ethereum':
    case 'fast-mainnet':
      return 'mainnet';
    default:
      return network.endsWith('-sepolia') ? 'testnet' : 'mainnet';
  }
}

function resolveSdkNetwork(
  network: string,
  sdkNetwork?: 'testnet' | 'mainnet'
): 'testnet' | 'mainnet' {
  return sdkNetwork ?? mapToSdkNetwork(network);
}

/**
 * Get token symbol for bridging based on network
 */
function getBridgeToken(network: string, sdkNetwork?: 'testnet' | 'mainnet'): string {
  return resolveSdkNetwork(network, sdkNetwork) === 'mainnet' ? 'fastUSDC' : 'testUSDC';
}

// ─── Bridge Config ────────────────────────────────────────────────────────────

/**
 * Get bridge configuration for a network using AllSetProvider
 */
export function getBridgeConfig(
  network: string,
  sdkNetwork?: 'testnet' | 'mainnet'
): BridgeConfig | null {
  const chain = mapEvmNetworkToChain(network);
  const resolvedSdkNetwork = resolveSdkNetwork(network, sdkNetwork);

  try {
    const allset = new AllSetProvider({ network: resolvedSdkNetwork });
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
 * @param wallet - FastWallet from @fastxyz/sdk
 * @returns Balance in raw units (6 decimals)
 */
export async function getFastBalance(wallet: FastWallet, network: 'testnet' | 'mainnet' = 'testnet'): Promise<bigint> {
  const token = network === 'mainnet' ? 'fastUSDC' : 'testUSDC';

  const balance = await wallet.provider.getBalance(wallet.address, token);

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
 * @param params - Bridge parameters
 * @returns Bridge result
 */
export async function bridgeFastusdcToUsdc(params: BridgeParams): Promise<BridgeResult> {
  const { fastWallet, evmReceiverAddress, amount, network, sdkNetwork, verbose = false, logs = [] } = params;

  const log = (msg: string) => {
    if (verbose) {
      logs.push(`[${new Date().toISOString()}] [Bridge] ${msg}`);
      logs.push('');
    }
  };

  const chain = mapEvmNetworkToChain(network);
  const resolvedSdkNetwork = resolveSdkNetwork(network, sdkNetwork);
  const token = getBridgeToken(network, resolvedSdkNetwork);

  log(`━━━ AllSet Bridge START ━━━`);
  log(`  Amount: ${Number(amount) / 1e6} ${token}`);
  log(`  From: ${fastWallet.address}`);
  log(`  To: ${evmReceiverAddress} on ${network}`);
  log(`  Using @fastxyz/allset-sdk`);

  try {
    const allset = new AllSetProvider({ network: resolvedSdkNetwork });

    log(`[Bridge] Executing sendToExternal via AllSet...`);
    const startTime = Date.now();

    // Execute bridge via AllSet
    const result = await allset.sendToExternal({
      chain,
      token,
      amount: amount.toString(),
      from: fastWallet.address,
      to: evmReceiverAddress,
      fastWallet,
    });

    const duration = Date.now() - startTime;
    log(`  ✓ Bridge completed in ${duration}ms`);
    log(`  Fast txHash: ${result.txHash}`);
    log(`  Order ID: ${result.orderId}`);
    log(`━━━ AllSet Bridge END ━━━`);

    return {
      success: true,
      txHash: result.txHash,
      orderId: result.orderId,
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
