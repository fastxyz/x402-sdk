/**
 * AllSet bridge integration for x402-client
 * 
 * Bridges fastUSDC from Fast to USDC on EVM chains when needed.
 * Chain configurations are imported from @fastxyz/allset-sdk.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { encodeAbiParameters, keccak256 } from 'viem';
import {
  FAST_NETWORK_IDS,
  fastAddressToBytes,
  getCertificateHash,
  serializeVersionedTransaction,
  type FastNetworkId,
  type FastTransaction,
  type FastTransactionCertificate,
} from '@fastxyz/sdk/core';
import { AllSetProvider } from '@fastxyz/allset-sdk/node';
import type { FastWallet } from './types.js';

// Configure ed25519
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

// ─── Constants ────────────────────────────────────────────────────────────────

const FAST_RPC_URL = 'https://testnet.api.fast.xyz/proxy';

/** fastUSDC token ID on Fast */
// fastUSDC token ID
const fastUSDC_TOKEN_ID = hexToBytes('b4cf1b9e227bb6a21b959338895dfb39b8d2a96dfa1ce5dd633561c193124cb5');

/** Bridge configuration per EVM chain */
export interface BridgeChainConfig {
  chainId: number;
  usdcAddress: string;
  fastBridgeAddress: string;
  relayerUrl: string;
  bridgeContract?: string;
}

// Cached AllSetProvider instances
const allsetProviders: Record<string, AllSetProvider> = {};

function getAllSetProvider(network: 'testnet' | 'mainnet' = 'testnet'): AllSetProvider {
  if (!allsetProviders[network]) {
    allsetProviders[network] = new AllSetProvider({ network });
  }
  return allsetProviders[network];
}

/**
 * Get bridge configuration for a network.
 * Configurations are loaded from @fastxyz/allset-sdk.
 */
export function getBridgeConfig(network: string): BridgeChainConfig | null {
  // Determine which AllSet network to use based on chain name
  const isTestnet = network.includes('sepolia') || network === 'base';
  const allset = getAllSetProvider(isTestnet ? 'testnet' : 'mainnet');
  
  // Map x402 network names to allset-sdk chain names
  const chainName = network === 'ethereum-sepolia' ? 'ethereum-sepolia'
    : network === 'arbitrum-sepolia' ? 'arbitrum-sepolia'
    : network === 'base' ? 'base'
    : network;
  
  const chainConfig = allset.getChainConfig(chainName);
  if (!chainConfig) return null;
  
  const tokenConfig = allset.getTokenConfig(chainName, 'USDC');
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
 * Get the cross-sign URL for a network.
 */
export function getCrossSignUrl(network: 'testnet' | 'mainnet' = 'testnet'): string {
  return getAllSetProvider(network).crossSignUrl;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function inferFastNetworkIdFromBridgeNetwork(network: string): FastNetworkId {
  return network.includes('sepolia')
    ? FAST_NETWORK_IDS.TESTNET
    : FAST_NETWORK_IDS.MAINNET;
}

function serializeFastRpcJsonValue(value: unknown): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return serializeFastRpcJsonValue(Array.from(value));
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeFastRpcJsonValue(item) ?? 'null').join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .flatMap(([key, entryValue]) => {
        const serialized = serializeFastRpcJsonValue(entryValue);
        return serialized === undefined ? [] : [`${JSON.stringify(key)}:${serialized}`];
      });
    return `{${entries.join(',')}}`;
  }
  return undefined;
}

function toFastRpcJson(data: unknown): string {
  const serialized = serializeFastRpcJsonValue(data);
  if (serialized === undefined) {
    throw new TypeError('Fast RPC payload must be JSON-serializable');
  }
  return serialized;
}

// ─── Fast Operations ───────────────────────────────────────────────────────

interface TransactionResult {
  txHash: string;
  certificate: {
    envelope: string;
    signatures: Array<{ committee_member: number[]; signature: number[] }>;
  };
  /** Transaction details for building TransferClaim hash */
  transferDetails?: {
    from: string;      // Fast address (bech32m)
    nonce: number;
    asset: string;     // Token ID as hex with 0x prefix
    amount: bigint;
    to: string;        // Recipient Fast address (bech32m)
  };
}

/**
 * Build TransferClaim hash the same way AllSetPortal does it.
 * This is keccak256 of ABI-encoded (from, nonce, asset, amount, to).
 */
function buildTransferClaimHash(details: NonNullable<TransactionResult['transferDetails']>): `0x${string}` {
  const hashData = encodeAbiParameters(
    [
      { name: 'from', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'asset', type: 'string' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'string' },
    ],
    [
      details.from.toLowerCase(),
      BigInt(details.nonce),
      details.asset,
      details.amount,
      details.to,
    ]
  );
  return keccak256(hashData);
}

/**
 * Get fastUSDC balance on Fast
 */
export async function getFastBalance(
  wallet: FastWallet
): Promise<bigint> {
  const rpcUrl = wallet.rpcUrl || FAST_RPC_URL;
  const publicKeyBytes = Buffer.from(wallet.publicKey, 'hex');
  
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'proxy_getAccountInfo',
    params: {
      address: Array.from(publicKeyBytes),
      token_balances_filter: [],
      state_key_filter: null,
      certificate_by_nonce: null,
    },
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json() as {
    result?: { token_balance?: Array<[number[], string]> };
    error?: { message: string };
  };

  if (result.error) {
    throw new Error(`Fast RPC error: ${result.error.message}`);
  }

  if (!result.result?.token_balance) {
    return 0n;
  }

  // Find fastUSDC balance (token_balance is array of [token_id, hex_amount])
  const fastusdcHex = bytesToHex(fastUSDC_TOKEN_ID);
  for (const [tokenId, hexAmount] of result.result.token_balance) {
    const tokenHex = bytesToHex(new Uint8Array(tokenId));
    if (tokenHex === fastusdcHex) {
      // Amount is hex string like "5f5e100"
      const amount = BigInt('0x' + hexAmount);
      return amount;
    }
  }

  return 0n;
}

/**
 * Send TokenTransfer on Fast
 */
async function sendTokenTransfer(
  wallet: FastWallet,
  fastNetworkId: FastNetworkId,
  recipientAddress: string,
  amount: bigint,
  tokenId: Uint8Array,
  rpcUrl: string = FAST_RPC_URL
): Promise<TransactionResult> {
  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = new Uint8Array(Buffer.from(wallet.publicKey, 'hex'));

  // Get nonce
  const noncePayload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'proxy_getAccountInfo',
    params: {
      address: Array.from(publicKeyBytes),
      token_balances_filter: [],
      state_key_filter: null,
      certificate_by_nonce: null,
    },
  };
  const nonceResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noncePayload),
  });
  const nonceResult = await nonceResponse.json() as { result?: { next_nonce: number } };
  const nonce = nonceResult.result?.next_nonce ?? 0;

  // Convert amount to hex for BCS
  const hexAmount = amount.toString(16);

  // Build proper transaction structure
  const transaction: FastTransaction = {
    network_id: fastNetworkId,
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
  const signatureBytes = await ed.signAsync(msg, privateKeyBytes.slice(0, 32));

  // Submit to RPC
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'proxy_submitTransaction',
    params: {
      transaction: {
        Release20260319: transaction,
      },
      signature: { Signature: Array.from(signatureBytes) },
    },
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: toFastRpcJson(payload),
  });

  const result = await response.json() as {
    result?: { Success?: unknown } | unknown;
    error?: { message: string };
  };

  if (result.error) {
    throw new Error(`Fast RPC error: ${result.error.message}`);
  }

  const submitResult = result.result as { Success?: unknown };
  const certificate = submitResult?.Success ?? submitResult;

  if (!certificate) {
    throw new Error('No result from Fast RPC');
  }
  const txHash = getCertificateHash(certificate as FastTransactionCertificate);

  return {
    txHash,
    certificate: certificate as TransactionResult['certificate'],
    transferDetails: {
      from: wallet.address,
      nonce,
      asset: '0x' + bytesToHex(tokenId),
      amount,
      to: recipientAddress,
    },
  };
}

/**
 * Submit ExternalClaim on Fast
 */
async function submitExternalClaim(
  wallet: FastWallet,
  fastNetworkId: FastNetworkId,
  intentPayload: Uint8Array,
  rpcUrl: string = FAST_RPC_URL
): Promise<TransactionResult> {
  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = new Uint8Array(Buffer.from(wallet.publicKey, 'hex'));

  // Get nonce
  const noncePayload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'proxy_getAccountInfo',
    params: {
      address: Array.from(publicKeyBytes),
      token_balances_filter: [],
      state_key_filter: null,
      certificate_by_nonce: null,
    },
  };
  const nonceResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noncePayload),
  });
  const nonceResult = await nonceResponse.json() as { result?: { next_nonce: number } };
  const nonce = nonceResult.result?.next_nonce ?? 0;

  // Build ExternalClaim structure
  // For bridging, we create a minimal ExternalClaim with the intent payload
  const externalClaimData = {
    claim: {
      verifier_committee: [],  // Will be filled by validators
      verifier_quorum: 0,
      claim_data: Array.from(intentPayload),
    },
    signatures: [],  // Will be filled by validators
  };

  // Build proper transaction structure
  const transaction: FastTransaction = {
    network_id: fastNetworkId,
    sender: publicKeyBytes,
    nonce,
    timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
    claim: {
      ExternalClaim: externalClaimData,
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
  const signatureBytes = await ed.signAsync(msg, privateKeyBytes.slice(0, 32));

  // Submit to RPC
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'proxy_submitTransaction',
    params: {
      transaction: {
        Release20260319: transaction,
      },
      signature: { Signature: Array.from(signatureBytes) },
    },
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: toFastRpcJson(payload),
  });

  const result = await response.json() as {
    result?: { Success?: unknown } | unknown;
    error?: { message: string };
  };

  if (result.error) {
    throw new Error(`Fast ExternalClaim error: ${result.error.message}`);
  }

  const submitResult = result.result as { Success?: unknown };
  const certificate = submitResult?.Success ?? submitResult;

  if (!certificate) {
    throw new Error('No result from Fast ExternalClaim');
  }
  const txHash = getCertificateHash(certificate as FastTransactionCertificate);

  return {
    txHash,
    certificate: certificate as TransactionResult['certificate'],
  };
}

/**
 * Cross-sign a certificate via AllSet
 */
async function crossSignCertificate(
  certificate: TransactionResult['certificate'],
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<{ transaction: number[]; signature: string }> {
  const crossSignUrl = getCrossSignUrl(network);
  const res = await fetch(crossSignUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'crossSign_evmSignCertificate',
      params: { certificate },
    }),
  });

  if (!res.ok) {
    throw new Error(`Cross-sign request failed: ${res.status}`);
  }

  const json = await res.json() as {
    result?: { transaction: number[]; signature: string };
    error?: { message: string };
  };

  if (json.error) {
    throw new Error(`Cross-sign error: ${json.error.message}`);
  }

  if (!json.result?.transaction || !json.result?.signature) {
    throw new Error('Cross-sign returned invalid response');
  }

  return json.result;
}

// ─── Main Bridge Function ─────────────────────────────────────────────────────

export interface BridgeParams {
  /** Fast wallet with fastUSDC */
  fastWallet: FastWallet;
  /** EVM address to receive USDC */
  evmReceiverAddress: string;
  /** Amount to bridge (raw, 6 decimals) */
  amount: bigint;
  /** Target EVM network */
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

/**
 * Bridge fastUSDC from Fast to USDC on EVM via AllSet
 */
export async function bridgeFastusdcToUsdc(params: BridgeParams): Promise<BridgeResult> {
  const { fastWallet, evmReceiverAddress, amount, network, verbose = false, logs = [] } = params;
  
  const log = (msg: string) => {
    if (verbose) {
      logs.push(`[${new Date().toISOString()}] [Bridge] ${msg}`);
      logs.push('');
    }
  };

  const bridgeConfig = getBridgeConfig(network);
  if (!bridgeConfig) {
    return { success: false, error: `Unsupported network for bridging: ${network}` };
  }

  log(`━━━ AllSet Bridge START ━━━`);
  log(`  Amount: ${Number(amount) / 1e6} fastUSDC`);
  log(`  From: ${fastWallet.address}`);
  log(`  To: ${evmReceiverAddress} on ${network}`);

  try {
    const rpcUrl = fastWallet.rpcUrl || FAST_RPC_URL;

    // Step 1: Transfer fastUSDC to Fast bridge account
    log(`[Step 1] Transferring fastUSDC to Fast bridge...`);
    const transferResult = await sendTokenTransfer(
      fastWallet,
      inferFastNetworkIdFromBridgeNetwork(network),
      bridgeConfig.fastBridgeAddress,
      amount,
      fastUSDC_TOKEN_ID,
      rpcUrl
    );
    log(`  ✓ Transfer tx: ${transferResult.txHash}`);

    // Step 2: Cross-sign the transfer certificate
    log(`[Step 2] Cross-signing transfer certificate...`);
    const transferCrossSign = await crossSignCertificate(transferResult.certificate);
    log(`  ✓ Transfer cross-signed`);

    // Step 3: Build IntentClaim for DynamicTransfer
    log(`[Step 3] Building IntentClaim...`);
    
    // transferFastTxId is the BCS transaction hash (keccak256 of BCS-serialized transaction)
    // This matches AllSetPortal's hashTransaction() function
    const transferFastTxId = transferResult.txHash as `0x${string}`;
    log(`  Transfer tx hash: ${transferFastTxId}`);
    
    // DynamicTransfer payload: (tokenAddress, recipient)
    const dynamicTransferPayload = encodeAbiParameters(
      [{ type: 'address' }, { type: 'address' }],
      [
        bridgeConfig.usdcAddress as `0x${string}`,
        evmReceiverAddress as `0x${string}`,
      ]
    );

    // Deadline: 1 hour from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // IntentClaim struct
    const intentClaimEncoded = encodeAbiParameters(
      [{
        type: 'tuple',
        components: [
          { name: 'transferFastTxId', type: 'bytes32' },
          { name: 'deadline', type: 'uint256' },
          {
            name: 'intents',
            type: 'tuple[]',
            components: [
              { name: 'action', type: 'uint8' },
              { name: 'payload', type: 'bytes' },
              { name: 'value', type: 'uint256' },
            ],
          },
        ],
      }],
      [{
        transferFastTxId: transferFastTxId,
        deadline,
        intents: [{
          action: 1,  // DynamicTransfer
          payload: dynamicTransferPayload,
          value: 0n,
        }],
      }]
    );

    const intentBytes = hexToBytes(intentClaimEncoded);
    log(`  ✓ IntentClaim built (${intentBytes.length} bytes)`);

    // Step 4: Submit ExternalClaim on Fast
    log(`[Step 4] Submitting ExternalClaim...`);
    const intentResult = await submitExternalClaim(
      fastWallet,
      inferFastNetworkIdFromBridgeNetwork(network),
      intentBytes,
      rpcUrl
    );
    log(`  ✓ ExternalClaim tx: ${intentResult.txHash}`);

    // Step 5: Cross-sign the intent certificate
    log(`[Step 5] Cross-signing intent certificate...`);
    const intentCrossSign = await crossSignCertificate(intentResult.certificate);
    log(`  ✓ Intent cross-signed`);

    // Step 6: POST to relayer
    log(`[Step 6] Posting to relayer...`);
    // AllSet relayer requires transfer_fast_tx_id and intent_fast_tx_id fields
    const relayerBody = {
      encoded_transfer_claim: Array.from(new Uint8Array(transferCrossSign.transaction.map(Number))),
      transfer_proof: transferCrossSign.signature,
      transfer_fast_tx_id: transferResult.txHash,
      transfer_claim_id: transferResult.txHash,
      fastset_address: fastWallet.address,
      external_address: evmReceiverAddress,
      encoded_intent_claim: Array.from(new Uint8Array(intentCrossSign.transaction.map(Number))),
      intent_proof: intentCrossSign.signature,
      intent_fast_tx_id: intentResult.txHash,
      intent_claim_id: intentResult.txHash,
      external_token_address: bridgeConfig.usdcAddress,
    };

    const relayRes = await fetch(`${bridgeConfig.relayerUrl}/relay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(relayerBody),
    });

    if (!relayRes.ok) {
      const text = await relayRes.text();
      throw new Error(`Relayer request failed (${relayRes.status}): ${text}`);
    }

    const relayResult = await relayRes.json();
    log(`  ✓ Relayer accepted`);
    log(`━━━ AllSet Bridge END ━━━`);

    return {
      success: true,
      txHash: transferResult.txHash,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`  ✗ Bridge failed: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}
