/**
 * OmniSet bridge integration for x402-client
 * 
 * Bridges SETUSDC from FastSet to USDC on EVM chains when needed.
 */

import { bcs } from '@mysten/bcs';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { bech32m } from 'bech32';
import { encodeAbiParameters, keccak256 } from 'viem';
import type { FastSetWallet } from './types.js';

// Configure ed25519
ed.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed.etc.concatBytes(...m));

// ─── Constants ────────────────────────────────────────────────────────────────

const CROSS_SIGN_URL = 'https://staging.omniset.fastset.xyz/cross-sign';
const FASTSET_RPC_URL = 'https://api.fast.xyz/proxy';

/** SETUSDC token ID on FastSet */
const SETUSDC_TOKEN_ID = hexToBytes('1e744900021182b293538bb6685b77df095e351364d550021614ce90c8ab9e0a');

/** Bridge configuration per EVM chain */
interface BridgeChainConfig {
  chainId: number;
  usdcAddress: string;
  fastsetBridgeAddress: string;
  relayerUrl: string;
}

const BRIDGE_CONFIGS: Record<string, BridgeChainConfig> = {
  'arbitrum-sepolia': {
    chainId: 421614,
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    fastsetBridgeAddress: 'fast1pz07pdlspsydyt2g79yeshunhfyjsr5j4ahuyfv8hpdn00ks8u6q8axf9t',
    relayerUrl: 'https://staging.omniset.fastset.xyz/arbitrum-sepolia-relayer/relay',
  },
  'base-sepolia': {
    chainId: 84532,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    fastsetBridgeAddress: 'fast1pz07pdlspsydyt2g79yeshunhfyjsr5j4ahuyfv8hpdn00ks8u6q8axf9t', // TODO: verify base bridge address
    relayerUrl: 'https://staging.omniset.fastset.xyz/base-sepolia-relayer/relay',
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

// ─── FastSet Operations ───────────────────────────────────────────────────────

interface TransactionResult {
  txHash: string;
  certificate: {
    envelope: string;
    signatures: Array<{ committee_member: number[]; signature: number[] }>;
  };
}

/**
 * Get SETUSDC balance on FastSet
 */
export async function getFastSetBalance(
  wallet: FastSetWallet
): Promise<bigint> {
  const rpcUrl = wallet.rpcUrl || FASTSET_RPC_URL;
  const publicKeyBytes = Buffer.from(wallet.publicKey, 'hex');
  
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'proxy_getAccount',
    params: { public_key: Array.from(publicKeyBytes) },
  };

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json() as {
    result?: { balances?: Array<{ token_id: number[]; amount: string | number }> };
    error?: { message: string };
  };

  if (result.error) {
    throw new Error(`FastSet RPC error: ${result.error.message}`);
  }

  if (!result.result?.balances) {
    return 0n;
  }

  // Find SETUSDC balance
  const setusdcHex = bytesToHex(SETUSDC_TOKEN_ID);
  for (const bal of result.result.balances) {
    const tokenHex = bytesToHex(new Uint8Array(bal.token_id));
    if (tokenHex === setusdcHex) {
      // Handle both string and number amounts
      const amount = typeof bal.amount === 'string' 
        ? (bal.amount.startsWith('0x') ? BigInt(bal.amount) : BigInt(bal.amount))
        : BigInt(bal.amount);
      return amount;
    }
  }

  return 0n;
}

/**
 * Send TokenTransfer on FastSet
 */
async function sendTokenTransfer(
  wallet: FastSetWallet,
  recipientAddress: string,
  amount: bigint,
  tokenId: Uint8Array,
  rpcUrl: string = FASTSET_RPC_URL
): Promise<TransactionResult> {
  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = Buffer.from(wallet.publicKey, 'hex');

  // Decode recipient address
  const decoded = bech32m.decode(recipientAddress, 90);
  const recipientPubKey = new Uint8Array(bech32m.fromWords(decoded.words));

  // Build transaction
  const tx = {
    from: Array.from(publicKeyBytes),
    to: Array.from(recipientPubKey),
    token_id: Array.from(tokenId),
    amount,
  };

  const txBytes = TokenTransfer.serialize(tx).toBytes();
  
  // Sign transaction
  const signatureBytes = await ed.signAsync(txBytes, privateKeyBytes.slice(0, 32));

  // Submit to RPC
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'proxy_submitAndWait',
    params: {
      claim: { TokenTransfer: tx },
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
    result?: { tx_hash: string; certificate: TransactionResult['certificate'] };
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

/**
 * Submit ExternalClaim on FastSet
 */
async function submitExternalClaim(
  wallet: FastSetWallet,
  externalAddress: string,
  intentPayload: Uint8Array,
  rpcUrl: string = FASTSET_RPC_URL
): Promise<TransactionResult> {
  const privateKeyBytes = Buffer.from(wallet.privateKey, 'hex');
  const publicKeyBytes = Buffer.from(wallet.publicKey, 'hex');

  // Pad external address to 32 bytes
  const cleanAddr = externalAddress.startsWith('0x') ? externalAddress.slice(2) : externalAddress;
  const externalAddrBytes = new Uint8Array(32);
  const addrBytes = hexToBytes(cleanAddr);
  externalAddrBytes.set(addrBytes, 32 - addrBytes.length);

  // Build ExternalClaim
  const claim = {
    external_address: Array.from(externalAddrBytes),
    payload: Array.from(intentPayload),
  };

  const claimBytes = ClaimType.serialize({ ExternalClaim: claim }).toBytes();
  
  // Sign
  const signatureBytes = await ed.signAsync(claimBytes, privateKeyBytes.slice(0, 32));

  // Submit
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'proxy_submitAndWait',
    params: {
      claim: { ExternalClaim: claim },
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
    result?: { tx_hash: string; certificate: TransactionResult['certificate'] };
    error?: { message: string };
  };

  if (result.error) {
    throw new Error(`FastSet ExternalClaim error: ${result.error.message}`);
  }

  if (!result.result) {
    throw new Error('No result from FastSet ExternalClaim');
  }

  return {
    txHash: result.result.tx_hash,
    certificate: result.result.certificate,
  };
}

/**
 * Cross-sign a certificate via OmniSet
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
  /** FastSet wallet with SETUSDC */
  fastsetWallet: FastSetWallet;
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
 * Bridge SETUSDC from FastSet to USDC on EVM via OmniSet
 */
export async function bridgeSetusdcToUsdc(params: BridgeParams): Promise<BridgeResult> {
  const { fastsetWallet, evmReceiverAddress, amount, network, verbose = false, logs = [] } = params;
  
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

  log(`━━━ OmniSet Bridge START ━━━`);
  log(`  Amount: ${Number(amount) / 1e6} SETUSDC`);
  log(`  From: ${fastsetWallet.address}`);
  log(`  To: ${evmReceiverAddress} on ${network}`);

  try {
    const rpcUrl = fastsetWallet.rpcUrl || FASTSET_RPC_URL;

    // Step 1: Transfer SETUSDC to FastSet bridge account
    log(`[Step 1] Transferring SETUSDC to FastSet bridge...`);
    const transferResult = await sendTokenTransfer(
      fastsetWallet,
      bridgeConfig.fastsetBridgeAddress,
      amount,
      SETUSDC_TOKEN_ID,
      rpcUrl
    );
    log(`  ✓ Transfer tx: ${transferResult.txHash}`);

    // Step 2: Cross-sign the transfer certificate
    log(`[Step 2] Cross-signing transfer certificate...`);
    const transferCrossSign = await crossSignCertificate(transferResult.certificate);
    log(`  ✓ Transfer cross-signed`);

    // Step 3: Build IntentClaim for DynamicTransfer
    log(`[Step 3] Building IntentClaim...`);
    const transferFastTxId = transferResult.txHash as `0x${string}`;
    
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

    // Step 4: Submit ExternalClaim on FastSet
    log(`[Step 4] Submitting ExternalClaim...`);
    const intentResult = await submitExternalClaim(
      fastsetWallet,
      evmReceiverAddress,
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
    const relayerBody = {
      encoded_transfer_claim: Array.from(new Uint8Array(transferCrossSign.transaction)),
      transfer_proof: transferCrossSign.signature,
      transfer_claim_id: transferResult.txHash,
      fastset_address: fastsetWallet.address,
      external_address: evmReceiverAddress,
      encoded_intent_claim: Array.from(new Uint8Array(intentCrossSign.transaction)),
      intent_proof: intentCrossSign.signature,
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
    log(`━━━ OmniSet Bridge END ━━━`);

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
