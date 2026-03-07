/**
 * AllSet bridge integration for x402-client
 * 
 * Bridges fastUSDC from Fast to USDC on EVM chains when needed.
 */

import { bcs } from '@mysten/bcs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { bech32m } from 'bech32';
import { encodeAbiParameters, keccak256 } from 'viem';
import type { FastWallet } from './types.js';

// Configure ed25519
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

// ─── Constants ────────────────────────────────────────────────────────────────

const CROSS_SIGN_URL = 'https://staging.omniset.fastset.xyz/cross-sign';
const FAST_RPC_URL = 'https://staging.api.fastset.xyz/proxy';

/** fastUSDC token ID on Fast */
// fastUSDC token ID
const fastUSDC_TOKEN_ID = hexToBytes('1b48766165f2cc84292d8c06b0523e1eefd7586049be0f82249c002f88a409ef');

/** Bridge configuration per EVM chain */
interface BridgeChainConfig {
  chainId: number;
  usdcAddress: string;
  fastBridgeAddress: string;
  relayerUrl: string;
  bridgeContract?: string;
}

const BRIDGE_CONFIGS: Record<string, BridgeChainConfig> = {
  'arbitrum-sepolia': {
    chainId: 421614,
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    fastBridgeAddress: 'fast1pz07pdlspsydyt2g79yeshunhfyjsr5j4ahuyfv8hpdn00ks8u6q8axf9t',
    relayerUrl: 'https://staging.omniset.fastset.xyz/arbitrum-sepolia-relayer/relay',
    bridgeContract: '0xBb9111E62c9EE364cF6dc676d754602a2E259bd3',
  },
  'base-sepolia': {
    chainId: 84532,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    fastBridgeAddress: 'fast1x0g58phuf0pf32e9uvp3mv6hak4z37ytpqyfzjzhfsehua9kmegqwzv0td', // TODO: verify base bridge address
    relayerUrl: 'https://staging.allset.fastset.xyz/base-sepolia/relayer/relay',
  },
};

export function getBridgeConfig(network: string): BridgeChainConfig | null {
  return BRIDGE_CONFIGS[network] ?? null;
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

// ─── BCS Schema ───────────────────────────────────────────────────────────────

const Address = bcs.fixedArray(32, bcs.u8());
const TokenId = bcs.fixedArray(32, bcs.u8());

const TokenTransfer = bcs.struct('TokenTransfer', {
  from: Address,
  to: Address,
  token_id: TokenId,
  amount: bcs.u64(),
});

const ExternalClaim = bcs.struct('ExternalClaim', {
  external_address: Address,
  payload: bcs.vector(bcs.u8()),
});

const ClaimType = bcs.enum('ClaimType', {
  Transaction: TokenTransfer,
  Mint: null,
  Wrap: null,
  Unwrap: null,
  Burn: null,
  ExternalMint: null,
  ExternalUnwrap: null,
  ExternalClaim: ExternalClaim,
});

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
  const setusdcHex = bytesToHex(fastUSDC_TOKEN_ID);
  for (const [tokenId, hexAmount] of result.result.token_balance) {
    const tokenHex = bytesToHex(new Uint8Array(tokenId));
    if (tokenHex === setusdcHex) {
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
  recipientAddress: string,
  amount: bigint,
  tokenId: Uint8Array,
  rpcUrl: string = FAST_RPC_URL
): Promise<TransactionResult> {
  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = Buffer.from(wallet.publicKey, 'hex');

  // Decode recipient address
  const decoded = bech32m.decode(recipientAddress, 90);
  const recipientPubKey = new Uint8Array(bech32m.fromWords(decoded.words));

  // Custom JSON serializer for BigInt
  function toJSON(data: unknown): string {
    return JSON.stringify(data, (_k, v) => {
      if (v instanceof Uint8Array) return Array.from(v);
      if (typeof v === 'bigint') return Number(v);
      return v;
    });
  }

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
  const transaction = {
    sender: Array.from(publicKeyBytes),
    recipient: Array.from(recipientPubKey),
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

  // Import BCS for proper transaction structure
  const { bcs: bcsMod } = await import('@mysten/bcs');
  const AmountBcs = bcsMod.u256().transform({
    input: (val: string) => {
      // Handle both with and without 0x prefix
      const hexVal = val.startsWith('0x') ? val : `0x${val}`;
      return BigInt(hexVal).toString();
    },
  });
  const TokenTransferBcs = bcsMod.struct('TokenTransfer', {
    token_id: bcsMod.bytes(32),
    amount: AmountBcs,
    user_data: bcsMod.option(bcsMod.bytes(32)),
  });
  const ClaimTypeBcs = bcsMod.enum('ClaimType', {
    TokenTransfer: TokenTransferBcs,
    TokenCreation: bcsMod.struct('TokenCreation', { dummy: bcsMod.u8() }),
    TokenManagement: bcsMod.struct('TokenManagement', { dummy: bcsMod.u8() }),
    Mint: bcsMod.struct('Mint', { dummy: bcsMod.u8() }),
    Burn: bcsMod.struct('Burn', { dummy: bcsMod.u8() }),
    StateInitialization: bcsMod.struct('StateInitialization', { dummy: bcsMod.u8() }),
    StateUpdate: bcsMod.struct('StateUpdate', { dummy: bcsMod.u8() }),
    ExternalClaim: bcsMod.struct('ExternalClaim', { dummy: bcsMod.u8() }),
    StateReset: bcsMod.struct('StateReset', { dummy: bcsMod.u8() }),
    JoinCommittee: bcsMod.struct('JoinCommittee', { dummy: bcsMod.u8() }),
    LeaveCommittee: bcsMod.struct('LeaveCommittee', { dummy: bcsMod.u8() }),
    ChangeCommittee: bcsMod.struct('ChangeCommittee', { dummy: bcsMod.u8() }),
    Batch: bcsMod.struct('Batch', { dummy: bcsMod.u8() }),
  });
  const TransactionBcs = bcsMod.struct('Transaction', {
    sender: bcsMod.bytes(32),
    recipient: bcsMod.bytes(32),
    nonce: bcsMod.u64(),
    timestamp_nanos: bcsMod.u128(),
    claim: ClaimTypeBcs,
    archival: bcsMod.bool(),
  });

  // Sign: ed25519("Transaction::" + BCS(transaction))
  const msgHead = new TextEncoder().encode('Transaction::');
  const msgBody = TransactionBcs.serialize(transaction).toBytes();
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
      transaction,
      signature: { Signature: Array.from(signatureBytes) },
    },
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: toJSON(payload),
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

  // Hash the transaction from the returned certificate (not our local copy)
  // This matches how AllSetPortal computes transferClaimId using hashTransaction()
  const { keccak_256 } = await import('@noble/hashes/sha3');
  const cert = certificate as { envelope?: { transaction?: unknown } };
  
  let txHash: string;
  if (cert.envelope?.transaction) {
    // Clone and normalize the transaction for hashing - MUST match AllSetPortal format exactly
    const certTx = JSON.parse(JSON.stringify(cert.envelope.transaction));
    
    // Amount: AllSetPortal just does "0x" + amount (the amount is already hex without prefix)
    // The Fast network returns amount as a hex string WITHOUT 0x prefix
    if (certTx.claim?.TokenTransfer?.amount !== undefined) {
      const amt = certTx.claim.TokenTransfer.amount;
      if (typeof amt === 'string' && !amt.startsWith('0x')) {
        // String without 0x - this IS a hex string, just add prefix
        certTx.claim.TokenTransfer.amount = '0x' + amt;
      } else if (typeof amt === 'number') {
        // Number - convert to hex
        certTx.claim.TokenTransfer.amount = '0x' + BigInt(amt).toString(16);
      }
      // If already has 0x prefix, keep as is
    }
    
    // timestamp_nanos: AllSetPortal does toHex(BigInt(timestamp_nanos)) - hex string with 0x prefix
    if (certTx.timestamp_nanos !== undefined) {
      const ts = BigInt(certTx.timestamp_nanos.toString());
      certTx.timestamp_nanos = '0x' + ts.toString(16);
    }
    
    const certTxBytes = TransactionBcs.serialize(certTx).toBytes();
    txHash = '0x' + Buffer.from(keccak_256(certTxBytes)).toString('hex');
  } else {
    // Fallback to hashing our local transaction
    txHash = '0x' + Buffer.from(keccak_256(msgBody)).toString('hex');
  }

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
  externalAddress: string,
  intentPayload: Uint8Array,
  rpcUrl: string = FAST_RPC_URL
): Promise<TransactionResult> {
  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = Buffer.from(wallet.publicKey, 'hex');

  // Custom JSON serializer for BigInt
  function toJSON(data: unknown): string {
    return JSON.stringify(data, (_k, v) => {
      if (v instanceof Uint8Array) return Array.from(v);
      if (typeof v === 'bigint') return Number(v);
      return v;
    });
  }

  // Decode recipient address - handle both Fast (bech32m) and EVM (hex) formats
  let recipientPubKey: Uint8Array;
  if (externalAddress.startsWith('fast1') || externalAddress.startsWith('set1')) {
    // Decode bech32m Fast address to pubkey bytes
    const { bech32m: scureBech32m } = await import('@scure/base');
    const decoded = scureBech32m.decode(externalAddress as `${string}1${string}`);
    recipientPubKey = new Uint8Array(scureBech32m.fromWords(decoded.words));
  } else {
    // EVM address - pad to 32 bytes (right-aligned)
    const cleanAddr = externalAddress.startsWith('0x') ? externalAddress.slice(2) : externalAddress;
    recipientPubKey = new Uint8Array(32);
    const addrBytes = hexToBytes(cleanAddr);
    recipientPubKey.set(addrBytes, 32 - addrBytes.length);
  }

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

  // Import BCS for proper transaction structure
  const { bcs: bcsMod } = await import('@mysten/bcs');
  
  // ExternalClaim BCS definition
  const ExternalClaimBodyBcs = bcsMod.struct('ExternalClaimBody', {
    verifier_committee: bcsMod.vector(bcsMod.bytes(32)),
    verifier_quorum: bcsMod.u64(),
    claim_data: bcsMod.vector(bcsMod.u8()),
  });

  const ExternalClaimFullBcs = bcsMod.struct('ExternalClaimFull', {
    claim: ExternalClaimBodyBcs,
    signatures: bcsMod.vector(bcsMod.tuple([bcsMod.bytes(32), bcsMod.bytes(64)])),
  });

  // ClaimType enum with ExternalClaim at correct position
  const AmountBcs = bcsMod.u256().transform({
    input: (val: string) => {
      // Handle both with and without 0x prefix
      const hexVal = val.startsWith('0x') ? val : `0x${val}`;
      return BigInt(hexVal).toString();
    },
  });
  const TokenTransferBcs = bcsMod.struct('TokenTransfer', {
    token_id: bcsMod.bytes(32),
    amount: AmountBcs,
    user_data: bcsMod.option(bcsMod.bytes(32)),
  });

  const ClaimTypeBcs = bcsMod.enum('ClaimType', {
    TokenTransfer: TokenTransferBcs,
    TokenCreation: bcsMod.struct('TokenCreation', { dummy: bcsMod.u8() }),
    TokenManagement: bcsMod.struct('TokenManagement', { dummy: bcsMod.u8() }),
    Mint: bcsMod.struct('Mint', { dummy: bcsMod.u8() }),
    Burn: bcsMod.struct('Burn', { dummy: bcsMod.u8() }),
    StateInitialization: bcsMod.struct('StateInitialization', { dummy: bcsMod.u8() }),
    StateUpdate: bcsMod.struct('StateUpdate', { dummy: bcsMod.u8() }),
    ExternalClaim: ExternalClaimFullBcs,  // Index 7
    StateReset: bcsMod.struct('StateReset', { dummy: bcsMod.u8() }),
    JoinCommittee: bcsMod.struct('JoinCommittee', { dummy: bcsMod.u8() }),
    LeaveCommittee: bcsMod.struct('LeaveCommittee', { dummy: bcsMod.u8() }),
    ChangeCommittee: bcsMod.struct('ChangeCommittee', { dummy: bcsMod.u8() }),
    Batch: bcsMod.struct('Batch', { dummy: bcsMod.u8() }),
  });

  const TransactionBcs = bcsMod.struct('Transaction', {
    sender: bcsMod.bytes(32),
    recipient: bcsMod.bytes(32),
    nonce: bcsMod.u64(),
    timestamp_nanos: bcsMod.u128(),
    claim: ClaimTypeBcs,
    archival: bcsMod.bool(),
  });

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
  const transaction = {
    sender: Array.from(publicKeyBytes),
    recipient: Array.from(recipientPubKey),
    nonce,
    timestamp_nanos: BigInt(Date.now()) * 1_000_000n,
    claim: {
      ExternalClaim: externalClaimData,
    },
    archival: false,
  };

  // Sign: ed25519("Transaction::" + BCS(transaction))
  const msgHead = new TextEncoder().encode('Transaction::');
  const msgBody = TransactionBcs.serialize(transaction).toBytes();
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
      transaction,
      signature: { Signature: Array.from(signatureBytes) },
    },
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: toJSON(payload),
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

  // Hash the transaction from the returned certificate
  const { keccak_256 } = await import('@noble/hashes/sha3');
  const cert = certificate as { envelope?: { transaction?: unknown } };
  
  let txHash: string;
  if (cert.envelope?.transaction) {
    const certTx = JSON.parse(JSON.stringify(cert.envelope.transaction));
    // Convert timestamp_nanos to hex string (AllSetPortal format)
    if (certTx.timestamp_nanos !== undefined) {
      certTx.timestamp_nanos = '0x' + BigInt(certTx.timestamp_nanos).toString(16);
    }
    const certTxBytes = TransactionBcs.serialize(certTx).toBytes();
    txHash = '0x' + Buffer.from(keccak_256(certTxBytes)).toString('hex');
  } else {
    txHash = '0x' + Buffer.from(keccak_256(msgBody)).toString('hex');
  }

  return {
    txHash,
    certificate: certificate as TransactionResult['certificate'],
  };
}

/**
 * Cross-sign a certificate via AllSet
 */
async function crossSignCertificate(
  certificate: TransactionResult['certificate']
): Promise<{ transaction: number[]; signature: string }> {
  const res = await fetch(CROSS_SIGN_URL, {
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
export async function bridgeSetusdcToUsdc(params: BridgeParams): Promise<BridgeResult> {
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

    // Step 4: Submit ExternalClaim on Fast (recipient = sender's own Fast address)
    log(`[Step 4] Submitting ExternalClaim...`);
    const intentResult = await submitExternalClaim(
      fastWallet,
      fastWallet.address,  // Must be sender's own address, not EVM receiver
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

    const relayRes = await fetch(bridgeConfig.relayerUrl, {
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
