/**
 * Fast payment handler for x402
 * 
 * Uses the actual Fast protocol with proper BCS serialization and signing.
 */

import type { 
  FastWallet, 
  PaymentRequired, 
  PaymentRequirement, 
  X402PayResult 
} from './types.js';

export const FAST_NETWORKS = ['fast-testnet', 'fast-mainnet', 'fast'];

const DEFAULT_RPC_URL = 'https://staging.proxy.fastset.xyz/';

/**
 * Create a Fast transaction executor
 */
async function createTxExecutor(wallet: FastWallet, rpcUrl: string) {
  const { bcs } = await import('@mysten/bcs');
  const ed = await import('@noble/ed25519');
  const { sha512 } = await import('@noble/hashes/sha512');
  const { keccak_256 } = await import('@noble/hashes/sha3');
  const { bech32m } = await import('@scure/base');
  
  // Configure ed25519 to use sha512
  ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = Buffer.from(wallet.publicKey, 'hex');

  // Helper to decode bech32m address to pubkey bytes
  function addressToPubkey(address: string): number[] {
    const decoded = bech32m.decode(address as `${string}1${string}`);
    return Array.from(bech32m.fromWords(decoded.words));
  }

  // Helper to convert amount to hex (for BCS serialization)
  const AmountBcs = bcs.u256().transform({
    input: (val: string) => BigInt(`0x${val}`).toString(),
  });

  // BCS schema matching Fast on-chain types
  const TokenTransferBcs = bcs.struct('TokenTransfer', {
    token_id: bcs.bytes(32),
    amount: AmountBcs,
    user_data: bcs.option(bcs.bytes(32)),
  });

  const ClaimTypeBcs = bcs.enum('ClaimType', {
    TokenTransfer: TokenTransferBcs,
    TokenCreation: bcs.struct('TokenCreation', { dummy: bcs.u8() }),
    TokenManagement: bcs.struct('TokenManagement', { dummy: bcs.u8() }),
    Mint: bcs.struct('Mint', { dummy: bcs.u8() }),
    Burn: bcs.struct('Burn', { dummy: bcs.u8() }),
    StateInitialization: bcs.struct('StateInitialization', { dummy: bcs.u8() }),
    StateUpdate: bcs.struct('StateUpdate', { dummy: bcs.u8() }),
    ExternalClaim: bcs.struct('ExternalClaim', { dummy: bcs.u8() }),
    StateReset: bcs.struct('StateReset', { dummy: bcs.u8() }),
    JoinCommittee: bcs.struct('JoinCommittee', { dummy: bcs.u8() }),
    LeaveCommittee: bcs.struct('LeaveCommittee', { dummy: bcs.u8() }),
    ChangeCommittee: bcs.struct('ChangeCommittee', { dummy: bcs.u8() }),
    Batch: bcs.struct('Batch', { dummy: bcs.u8() }),
  });

  const TransactionBcs = bcs.struct('Transaction', {
    sender: bcs.bytes(32),
    recipient: bcs.bytes(32),
    nonce: bcs.u64(),
    timestamp_nanos: bcs.u128(),
    claim: ClaimTypeBcs,
    archival: bcs.bool(),
  });

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

  // Transaction type for serialization
  type Transaction = Parameters<typeof TransactionBcs.serialize>[0];

  // Hash transaction for txHash
  function hashTransaction(tx: Transaction): string {
    const bytes = TransactionBcs.serialize(tx).toBytes();
    const hash = keccak_256(bytes);
    return Buffer.from(hash).toString('hex');
  }

  async function sendTokenTransfer(
    recipientAddress: string,
    amount: string,
    tokenId: Uint8Array
  ): Promise<{ txHash: string; certificate: unknown }> {
    const senderPubkey = Array.from(publicKeyBytes);
    const recipientPubkey = addressToPubkey(recipientAddress);

    // Convert amount to hex for BCS
    const hexAmount = BigInt(amount).toString(16);

    // Get nonce
    const accountInfo = await rpcCall('proxy_getAccountInfo', {
      address: senderPubkey,
      token_balances_filter: [],
      state_key_filter: null,
      certificate_by_nonce: null,
    }) as { next_nonce: number } | null;

    const nonce = accountInfo?.next_nonce ?? 0;

    // Build transaction
    const transaction = {
      sender: senderPubkey,
      recipient: recipientPubkey,
      nonce,
      timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
      claim: {
        TokenTransfer: {
          token_id: Array.from(tokenId),
          amount: hexAmount,
          user_data: null,
        },
      },
      archival: false,
    };

    // Sign: ed25519("Transaction::" + BCS(transaction))
    const msgHead = new TextEncoder().encode('Transaction::');
    const msgBody = TransactionBcs.serialize(transaction).toBytes();
    const msg = new Uint8Array(msgHead.length + msgBody.length);
    msg.set(msgHead, 0);
    msg.set(msgBody, msgHead.length);
    const signature = await ed.signAsync(msg, privateKeyBytes.slice(0, 32));

    const txHash = hashTransaction(transaction);

    // Custom JSON serializer for BigInt and Uint8Array
    function toJSON(data: unknown): string {
      return JSON.stringify(data, (_k, v) => {
        if (v instanceof Uint8Array) return Array.from(v);
        if (typeof v === 'bigint') return Number(v);
        return v;
      });
    }

    // Submit transaction (use custom serializer for BigInt)
    const submitPayload = {
      transaction,
      signature: { Signature: Array.from(signature) },
    };

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: toJSON({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'proxy_submitTransaction',
        params: submitPayload,
      }),
    });
    const result = await response.json() as { result?: { Success?: unknown }; error?: { message: string } };
    if (result.error) {
      throw new Error(`Fast RPC error (submit): ${result.error.message}`);
    }
    const submitResult = result.result as { Success?: unknown };

    const certificate = submitResult?.Success ?? submitResult;
    if (!certificate) {
      throw new Error('proxy_submitTransaction returned empty result');
    }

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

  const rpcUrl = wallet.rpcUrl || DEFAULT_RPC_URL;
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
    fastReq.payTo,
    fastReq.maxAmountRequired,
    tokenId
  );
  log(`  Transaction complete in ${Date.now() - txStartTime}ms`);
  log(`  txHash: ${txHash}`);

  // Build x402 payment payload
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
