/**
 * Fast payment handler for x402
 *
 * Uses @fastxyz/sdk for Fast network operations.
 * Accepts both FastWallet class instances and simple config objects.
 */

import { FastProvider, FastWallet as FastWalletClass } from '@fastxyz/sdk';
import type {
  FastWallet,
  FastWalletConfig,
  PaymentRequired,
  PaymentRequirement,
  X402PayResult,
} from './types.js';
import { isFastWalletClass } from './types.js';

export const FAST_NETWORKS = ['fast-testnet', 'fast-mainnet', 'fast'];

/**
 * Map x402 network name to @fastxyz/sdk network type
 */
function mapNetwork(network: string): 'testnet' | 'mainnet' {
  if (network === 'fast-mainnet') return 'mainnet';
  return 'testnet';
}

/**
 * Convert hex token ID to Uint8Array
 */
function hexToTokenId(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = clean.padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Handle x402 payment on Fast network
 *
 * @param wallet - FastWallet class from @fastxyz/sdk OR simple config object
 */
export async function handleFastPayment(
  url: string,
  method: string,
  customHeaders: Record<string, string>,
  requestBody: string | undefined,
  paymentRequired: PaymentRequired,
  fastReq: PaymentRequirement,
  wallet: FastWallet,
  verbose: boolean = false,
  logs: string[] = []
): Promise<X402PayResult> {
  const log = (msg: string) => {
    if (verbose) {
      logs.push(`[${new Date().toISOString()}] ${msg}`);
      logs.push('');
    }
  };

  log(`━━━ Fast Payment Handler START ━━━`);
  log(`  Network: ${fastReq.network}`);
  log(`  Amount: ${fastReq.maxAmountRequired} (raw)`);
  log(`  Recipient: ${fastReq.payTo}`);

  // Resolve wallet - either use directly or create from config
  let fastWallet: FastWalletClass;
  let walletAddress: string;

  if (isFastWalletClass(wallet)) {
    // Already a FastWallet class instance
    fastWallet = wallet;
    walletAddress = wallet.address;
    log(`  Using provided FastWallet instance`);
  } else {
    // Simple config - create FastWallet from private key
    const config = wallet as FastWalletConfig;
    const network = mapNetwork(fastReq.network);
    const provider = new FastProvider({
      network,
      rpcUrl: config.rpcUrl,
    });
    fastWallet = await FastWalletClass.fromPrivateKey(config.privateKey, provider);
    // Use provided address or get from wallet (derived from privateKey)
    walletAddress = config.address ?? fastWallet.address;
    log(`  Created FastWallet from config`);
  }

  log(`  Using @fastxyz/sdk`);
  log(`  Payer: ${walletAddress}`);

  // Determine token ID
  let tokenId: Uint8Array;
  if (fastReq.asset) {
    tokenId = hexToTokenId(fastReq.asset);
    log(`  Token from asset: ${fastReq.asset}`);
  } else {
    // Default FAST token ID
    tokenId = new Uint8Array(32);
    tokenId.set([0xfa, 0x57, 0x5e, 0x70], 0);
    log(`  Using default FAST token`);
  }

  // Convert amount to hex for BCS
  const hexAmount = BigInt(fastReq.maxAmountRequired).toString(16);

  log(`[Fast] Submitting payment via @fastxyz/sdk...`);
  const txStartTime = Date.now();

  // Use submit() to get the full certificate
  const result = await fastWallet.submit({
    recipient: fastReq.payTo,
    claim: {
      TokenTransfer: {
        token_id: Array.from(tokenId),
        amount: hexAmount,
        user_data: null,
      },
    },
  });

  log(`  Transaction complete in ${Date.now() - txStartTime}ms`);
  log(`  txHash: ${result.txHash}`);

  // Build x402 payment payload
  log(`[Fast] Building x402 payment payload...`);
  const paymentPayload = {
    x402Version: paymentRequired.x402Version ?? 1,
    scheme: 'exact',
    network: fastReq.network,
    payload: {
      type: 'signAndSendTransaction',
      transactionCertificate: result.certificate,
    },
  };

  const payloadBase64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  log(`  Payload base64 length: ${payloadBase64.length}`);

  // Retry request with X-PAYMENT header
  log(`[Fast] Sending paid request with X-PAYMENT header...`);
  const paidRes = await fetch(url, {
    method,
    headers: { ...customHeaders, 'X-PAYMENT': payloadBase64 },
    body: requestBody,
  });
  log(`  Response: ${paidRes.status} ${paidRes.statusText}`);

  const resHeaders: Record<string, string> = {};
  paidRes.headers.forEach((v, k) => {
    resHeaders[k] = v;
  });

  let resBody: unknown;
  try {
    resBody = await paidRes.json();
  } catch {
    resBody = await paidRes.text();
  }

  // Calculate human-readable amount (assuming 6 decimals for USDC, 9 for FAST)
  const decimals = fastReq.asset ? 6 : 9;
  const amountHuman = (Number(fastReq.maxAmountRequired) / Math.pow(10, decimals)).toString();

  log(`━━━ Fast Payment Handler END ━━━`);
  log(`  Success: ${paidRes.ok}`);
  log(`  Amount: ${amountHuman}`);

  return {
    success: paidRes.ok,
    statusCode: paidRes.status,
    headers: resHeaders,
    body: resBody,
    payment: {
      network: fastReq.network,
      amount: amountHuman,
      recipient: fastReq.payTo,
      txHash: result.txHash,
    },
    note: paidRes.ok
      ? `Fast payment of ${amountHuman} successful. Content delivered.`
      : `Payment submitted (tx: ${result.txHash}) but server returned ${paidRes.status}.`,
    logs: verbose ? logs : undefined,
  };
}
