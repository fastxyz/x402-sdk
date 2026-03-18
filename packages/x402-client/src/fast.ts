/**
 * Fast payment handler for x402
 *
 * Uses @fastxyz/sdk for Fast network operations.
 */

import { hexToTokenId, FAST_TOKEN_ID, type FastWallet } from '@fastxyz/sdk';
import type {
  PaymentRequired,
  PaymentRequirement,
  X402PayResult,
} from './types.js';

export const FAST_NETWORKS = ['fast-testnet', 'fast-mainnet', 'fast'];

/**
 * Handle x402 payment on Fast network
 *
 * @param wallet - FastWallet from @fastxyz/sdk
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
  log(`  Payer: ${wallet.address}`);

  // Determine token ID
  let tokenId: Uint8Array;
  if (fastReq.asset) {
    tokenId = hexToTokenId(fastReq.asset);
    log(`  Token from asset: ${fastReq.asset}`);
  } else {
    // Default FAST token ID from @fastxyz/sdk
    tokenId = FAST_TOKEN_ID;
    log(`  Using default FAST token`);
  }

  // Convert amount to hex for BCS
  const hexAmount = BigInt(fastReq.maxAmountRequired).toString(16);

  log(`[Fast] Submitting payment via @fastxyz/sdk...`);
  const txStartTime = Date.now();

  // Use submit() to get the full certificate
  const result = await wallet.submit({
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
