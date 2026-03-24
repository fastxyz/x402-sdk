/**
 * Fast payment handler for x402
 * 
 * Uses @fastxyz/sdk for Fast network operations.
 */

import { FastProvider, FastWallet as SdkFastWallet } from '@fastxyz/sdk';
import { toHuman } from '@fastxyz/sdk/core';
import type { 
  FastWallet, 
  PaymentRequired, 
  PaymentRequirement, 
  X402PayResult 
} from './types.js';
import { resolveFastRpcUrl } from './fast-rpc.js';

export const FAST_NETWORKS = ['fast-testnet', 'fast-mainnet'];

// ─── Cached Providers ─────────────────────────────────────────────────────────

const fastProviders: Record<string, FastProvider> = {};

function getFastProvider(network: string, rpcUrl?: string): FastProvider {
  const cacheKey = rpcUrl || network;
  if (!fastProviders[cacheKey]) {
    const resolvedRpcUrl = rpcUrl || (network === 'fast-mainnet' 
      ? 'https://api.fast.xyz/proxy'
      : 'https://testnet.api.fast.xyz/proxy');
    const networkType = network === 'fast-mainnet' ? 'mainnet' : 'testnet';
    
    fastProviders[cacheKey] = new FastProvider({ 
      rpcUrl: resolvedRpcUrl,
      network: networkType,
    });
  }
  return fastProviders[cacheKey];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serializeFastRpcJsonValue(value: unknown, quoteBigInt = false): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    // quoteBigInt: wrap in quotes to preserve precision through JSON.parse
    return quoteBigInt ? `"${value.toString()}"` : value.toString();
  }
  if (value instanceof Uint8Array) {
    return serializeFastRpcJsonValue(Array.from(value), quoteBigInt);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeFastRpcJsonValue(item, quoteBigInt) ?? 'null').join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .flatMap(([key, entryValue]) => {
        const serialized = serializeFastRpcJsonValue(entryValue, quoteBigInt);
        return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
      });
    return `{${entries.join(',')}}`;
  }
  return undefined;
}

function serializeX402Payload(data: unknown): string {
  const serialized = serializeFastRpcJsonValue(data, true); // Quote BigInts for precision
  if (serialized === undefined) {
    throw new TypeError('x402 payload must be JSON-serializable');
  }
  return serialized;
}

/**
 * Handle x402 payment on Fast network
 * Uses @fastxyz/sdk's FastWallet.send() for token transfers.
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

  const rpcUrl = resolveFastRpcUrl(fastReq.network, wallet.rpcUrl);
  log(`  RPC: ${rpcUrl}`);
  log(`  Payer: ${wallet.address}`);

  // Get Fast provider
  log(`[Fast] Getting FastProvider...`);
  const provider = getFastProvider(fastReq.network, rpcUrl);

  // Create FastWallet from private key using @fastxyz/sdk
  log(`[Fast] Creating FastWallet from private key...`);
  const sdkWallet = await SdkFastWallet.fromPrivateKey(wallet.privateKey, provider);
  log(`  Wallet address: ${sdkWallet.address}`);

  // Verify address matches
  if (sdkWallet.address !== wallet.address) {
    throw new Error(
      `Address mismatch: expected ${wallet.address}, got ${sdkWallet.address}`
    );
  }

  // Determine token
  log(`[Fast] Determining token...`);
  let token: string;
  if (fastReq.asset) {
    token = fastReq.asset;
    log(`  Token: ${token} (from payment requirement)`);
  } else {
    token = 'FAST';
    log(`  Token: FAST (default)`);
  }

  // Send payment using SDK's send() method
  // Convert raw amount to human-readable (FastWallet.send expects human-readable)
  const amountHuman = toHuman(fastReq.maxAmountRequired, 6);
  log(`[Fast] Sending payment via FastWallet.send()...`);
  log(`  Amount: ${fastReq.maxAmountRequired} raw → ${amountHuman} USDC`);
  const txStartTime = Date.now();
  
  const result = await sdkWallet.send({
    to: fastReq.payTo,
    amount: amountHuman,
    token,
  });
  
  log(`  Transaction complete in ${Date.now() - txStartTime}ms`);
  log(`  txHash: ${result.txHash}`);

  // Build x402 payment payload with the certificate
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

  const payloadBase64 = Buffer.from(serializeX402Payload(paymentPayload)).toString('base64');
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
  paidRes.headers.forEach((v, k) => { resHeaders[k] = v; });

  let resBody: unknown;
  try { resBody = await paidRes.json(); } catch { resBody = await paidRes.text(); }

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
