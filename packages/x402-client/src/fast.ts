/**
 * Fast payment handler for x402
 * 
 * Uses the actual Fast protocol with proper BCS serialization and signing.
 */

import {
  FAST_NETWORK_IDS,
  fastAddressToBytes,
  hashTransaction,
  serializeVersionedTransaction,
  type FastNetworkId,
  type FastTransaction,
} from '@fastxyz/sdk/core';
import type { 
  FastWallet, 
  PaymentRequired, 
  PaymentRequirement, 
  X402PayResult 
} from './types.js';
import { resolveFastRpcUrl } from './fast-rpc.js';

export const FAST_NETWORKS = ['fast-testnet', 'fast-mainnet'];

function toFastNetworkId(network: string): FastNetworkId {
  switch (network) {
    case 'fast-testnet':
      return FAST_NETWORK_IDS.TESTNET;
    case 'fast-mainnet':
      return FAST_NETWORK_IDS.MAINNET;
    default:
      throw new Error(`Unsupported Fast network: ${network}. Supported: ${FAST_NETWORKS.join(', ')}`);
  }
}

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

function toFastRpcJson(data: unknown): string {
  const serialized = serializeFastRpcJsonValue(data);
  if (serialized === undefined) {
    throw new TypeError('Fast RPC payload must be JSON-serializable');
  }
  return serialized;
}

/**
 * Create a Fast transaction executor
 */
async function createTxExecutor(wallet: FastWallet, rpcUrl: string) {
  const ed = await import('@noble/ed25519');
  const { sha512 } = await import('@noble/hashes/sha512');
  
  // Configure ed25519 to use sha512
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = new Uint8Array(Buffer.from(wallet.publicKey, 'hex'));

  // RPC call helper
  async function rpcCall(method: string, params: unknown): Promise<unknown> {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });
    const result = await response.json() as { result?: unknown; error?: { message: string } };
    if (result.error) {
      throw new Error(`Fast RPC error: ${result.error.message}`);
    }
    return result.result;
  }

  async function sendTokenTransfer(
    network: string,
    recipientAddress: string,
    amount: string,
    tokenId: Uint8Array
  ): Promise<{ txHash: string; certificate: unknown }> {
    // Convert amount to hex for BCS
    const hexAmount = BigInt(amount).toString(16);

    // Get nonce
    const accountInfo = await rpcCall('proxy_getAccountInfo', {
      address: Array.from(publicKeyBytes),
      token_balances_filter: [],
      state_key_filter: null,
      certificate_by_nonce: null,
    }) as { next_nonce: number } | null;

    const nonce = accountInfo?.next_nonce ?? 0;

    // Build transaction
    const transaction: FastTransaction = {
      network_id: toFastNetworkId(network),
      sender: publicKeyBytes,
      nonce,
      timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
      claim: {
        TokenTransfer: {
          token_id: tokenId,
          recipient: fastAddressToBytes(recipientAddress),
          amount: hexAmount,
          user_data: null,
        },
      },
      archival: false,
      fee_token: null,
    };

    // Sign: ed25519("VersionedTransaction::" + BCS(versioned_transaction))
    const msgHead = new TextEncoder().encode('VersionedTransaction::');
    const msgBody = serializeVersionedTransaction(transaction);
    const msg = new Uint8Array(msgHead.length + msgBody.length);
    msg.set(msgHead, 0);
    msg.set(msgBody, msgHead.length);
    const signature = await ed.signAsync(msg, privateKeyBytes.slice(0, 32));

    const txHash = hashTransaction(transaction);

    // Submit transaction (use custom serializer for BigInt)
    const envelope = {
      transaction: {
        Release20260319: transaction,
      },
      signature: { Signature: Array.from(signature) },
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: toFastRpcJson({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'proxy_submitTransaction',
        params: envelope,
      }),
    });
    const result = await response.json() as { result?: { Success?: { signatures?: unknown[] } }; error?: { message: string } };
    if (result.error) {
      throw new Error(`Fast RPC error (submit): ${result.error.message}`);
    }
    const submitResult = result.result as { Success?: { signatures?: unknown[] } } | undefined;
    const serverResult = submitResult?.Success;

    if (!serverResult?.signatures) {
      throw new Error('proxy_submitTransaction returned empty or invalid result');
    }

    // Build certificate using our original envelope (with full precision numbers)
    // and the committee signatures from the server response
    const certificate = {
      envelope,
      signatures: serverResult.signatures,
    };

    return { txHash, certificate };
  }

  return { sendTokenTransfer };
}

/**
 * Handle x402 payment on Fast network
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

  // Create transaction executor
  log(`[Fast] Creating transaction executor...`);
  const txExecutor = await createTxExecutor(wallet, rpcUrl);

  // Determine token ID
  log(`[Fast] Determining token ID...`);
  let tokenId: Uint8Array;
  if (fastReq.asset) {
    // Handle both hex (0x...) and base64 formats
    if (fastReq.asset.startsWith('0x')) {
      tokenId = new Uint8Array(Buffer.from(fastReq.asset.slice(2), 'hex'));
      log(`  Token from asset (hex): ${fastReq.asset}`);
    } else {
      tokenId = new Uint8Array(Buffer.from(fastReq.asset, 'base64'));
      log(`  Token from asset (base64): ${fastReq.asset}`);
    }
  } else {
    tokenId = new Uint8Array(32);
    tokenId.set([0xfa, 0x57, 0x5e, 0x70], 0); // Default FAST token
    log(`  Using default token ID`);
  }
  log(`  Token ID bytes: ${tokenId.length}`);

  // Send TokenTransfer
  log(`[Fast] Sending TokenTransfer transaction...`);
  const txStartTime = Date.now();
  const { txHash, certificate } = await txExecutor.sendTokenTransfer(
    fastReq.network,
    fastReq.payTo,
    fastReq.maxAmountRequired,
    tokenId
  );
  log(`  Transaction complete in ${Date.now() - txStartTime}ms`);
  log(`  txHash: ${txHash}`);

  // Build x402 payment payload
  // Use custom JSON serializer to handle BigInt values
  log(`[Fast] Building x402 payment payload...`);
  const paymentPayload = {
    x402Version: paymentRequired.x402Version ?? 1,
    scheme: 'exact',
    network: fastReq.network,
    payload: {
      type: 'signAndSendTransaction',
      transactionCertificate: certificate,
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

  const amountHuman = (Number(fastReq.maxAmountRequired) / 1e6).toString();

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
      txHash,
    },
    note: paidRes.ok
      ? `Fast payment of ${amountHuman} successful. Content delivered.`
      : `Payment submitted (tx: ${txHash}) but server returned ${paidRes.status}.`,
    logs: verbose ? logs : undefined,
  };
}
