/**
 * FastSet payment handler for x402
 */

import type { 
  FastSetWallet, 
  PaymentRequired, 
  PaymentRequirement, 
  X402PayResult 
} from './types.js';

export const FASTSET_NETWORKS = ['fastset-devnet', 'fastset-mainnet', 'fast'];

const DEFAULT_RPC_URL = 'https://api.fast.xyz/proxy';

/**
 * Create a FastSet transaction executor
 */
async function createTxExecutor(wallet: FastSetWallet, rpcUrl: string) {
  const { bcs } = await import('@mysten/bcs');
  const ed = await import('@noble/ed25519');
  const { sha512 } = await import('@noble/hashes/sha512');
  
  // Configure ed25519 to use sha512
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = Buffer.from(wallet.publicKey, 'hex');

  // BCS schema for FastSet transactions
  const Address = bcs.fixedArray(32, bcs.u8());
  const TokenId = bcs.fixedArray(32, bcs.u8());
  const TokenTransfer = bcs.struct('TokenTransfer', {
    from: Address,
    to: Address,
    token_id: TokenId,
    amount: bcs.u64(),
  });

  async function sendTokenTransfer(
    recipientAddress: string,
    amount: string,
    tokenId: Uint8Array
  ): Promise<{ txHash: string; certificate: unknown }> {
    // Decode recipient address
    const { bech32m } = await import('bech32');
    const decoded = bech32m.decode(recipientAddress, 90);
    const recipientPubKey = new Uint8Array(bech32m.fromWords(decoded.words));

    // Build transaction
    const tx = {
      from: Array.from(publicKeyBytes),
      to: Array.from(recipientPubKey),
      token_id: Array.from(tokenId),
      amount: BigInt(amount),
    };

    const txBytes = TokenTransfer.serialize(tx).toBytes();
    
    // Sign transaction
    const signatureBytes = await ed.signAsync(txBytes, privateKeyBytes.slice(0, 32));
    const signature = Buffer.from(signatureBytes).toString('hex');

    // Submit to RPC
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'proxy_submitAndWait',
      params: {
        claim: {
          TokenTransfer: tx,
        },
        signature: Array.from(signatureBytes),
        public_key: Array.from(publicKeyBytes),
      },
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json() as {
      result?: { tx_hash: string; certificate: unknown };
      error?: { message: string };
    };

    if (result.error) {
      throw new Error(`FastSet RPC error: ${result.error.message}`);
    }

    if (!result.result) {
      throw new Error('No result from FastSet RPC');
    }

    return {
      txHash: result.result.tx_hash,
      certificate: result.result.certificate,
    };
  }

  return { sendTokenTransfer };
}

/**
 * Handle x402 payment on FastSet network
 */
export async function handleFastSetPayment(
  url: string,
  method: string,
  customHeaders: Record<string, string>,
  requestBody: string | undefined,
  paymentRequired: PaymentRequired,
  fastsetReq: PaymentRequirement,
  wallet: FastSetWallet,
  verbose: boolean = false,
  logs: string[] = []
): Promise<X402PayResult> {
  const log = (msg: string) => { 
    if (verbose) { 
      logs.push(`[${new Date().toISOString()}] ${msg}`); 
      logs.push(''); 
    } 
  };

  log(`━━━ FastSet Payment Handler START ━━━`);
  log(`  Network: ${fastsetReq.network}`);
  log(`  Amount: ${fastsetReq.maxAmountRequired} (raw)`);
  log(`  Recipient: ${fastsetReq.payTo}`);

  const rpcUrl = wallet.rpcUrl || DEFAULT_RPC_URL;
  log(`  RPC: ${rpcUrl}`);
  log(`  Payer: ${wallet.address}`);

  // Create transaction executor
  log(`[FastSet] Creating transaction executor...`);
  const txExecutor = await createTxExecutor(wallet, rpcUrl);

  // Determine token ID
  log(`[FastSet] Determining token ID...`);
  let tokenId: Uint8Array;
  if (fastsetReq.asset) {
    tokenId = new Uint8Array(Buffer.from(fastsetReq.asset, 'base64'));
    log(`  Token from asset: ${fastsetReq.asset}`);
  } else {
    tokenId = new Uint8Array(32);
    tokenId.set([0xfa, 0x57, 0x5e, 0x70], 0); // Default FAST token
    log(`  Using default token ID`);
  }

  // Send TokenTransfer
  log(`[FastSet] Sending TokenTransfer transaction...`);
  const txStartTime = Date.now();
  const { txHash, certificate } = await txExecutor.sendTokenTransfer(
    fastsetReq.payTo,
    fastsetReq.maxAmountRequired,
    tokenId
  );
  log(`  Transaction complete in ${Date.now() - txStartTime}ms`);
  log(`  txHash: ${txHash}`);

  // Build x402 payment payload
  log(`[FastSet] Building x402 payment payload...`);
  const paymentPayload = {
    x402Version: paymentRequired.x402Version ?? 1,
    scheme: 'exact',
    network: fastsetReq.network,
    payload: {
      type: 'signAndSendTransaction',
      transactionCertificate: certificate,
    },
  };

  const payloadBase64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  log(`  Payload base64 length: ${payloadBase64.length}`);

  // Retry request with X-PAYMENT header
  log(`[FastSet] Sending paid request with X-PAYMENT header...`);
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

  const amountHuman = (Number(fastsetReq.maxAmountRequired) / 1e6).toString();

  log(`━━━ FastSet Payment Handler END ━━━`);
  log(`  Success: ${paidRes.ok}`);
  log(`  Amount: ${amountHuman}`);

  return {
    success: paidRes.ok,
    statusCode: paidRes.status,
    headers: resHeaders,
    body: resBody,
    payment: {
      network: fastsetReq.network,
      amount: amountHuman,
      recipient: fastsetReq.payTo,
      txHash,
    },
    note: paidRes.ok
      ? `FastSet payment of ${amountHuman} successful. Content delivered.`
      : `Payment submitted (tx: ${txHash}) but server returned ${paidRes.status}.`,
    logs: verbose ? logs : undefined,
  };
}
