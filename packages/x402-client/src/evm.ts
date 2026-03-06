/**
 * EVM payment handler for x402 using EIP-3009 transferWithAuthorization
 */

import { privateKeyToAccount } from 'viem/accounts';
import type { 
  EvmWallet, 
  PaymentRequired, 
  PaymentRequirement, 
  X402PayResult,
  Eip3009Authorization 
} from './types.js';

/**
 * Network configuration
 */
interface NetworkConfig {
  chain: string;
  network: 'testnet' | 'mainnet';
  chainId: number;
}

const NETWORK_MAP: Record<string, NetworkConfig> = {
  'arbitrum-sepolia': { chain: 'arbitrum', network: 'testnet', chainId: 421614 },
  'arbitrum': { chain: 'arbitrum', network: 'mainnet', chainId: 42161 },
  'base-sepolia': { chain: 'base', network: 'testnet', chainId: 84532 },
  'base': { chain: 'base', network: 'mainnet', chainId: 8453 },
};

export const EVM_NETWORKS = Object.keys(NETWORK_MAP);

/**
 * Handle x402 payment on EVM networks using EIP-3009
 */
export async function handleEvmPayment(
  url: string,
  method: string,
  customHeaders: Record<string, string>,
  requestBody: string | undefined,
  paymentRequired: PaymentRequired,
  evmReq: PaymentRequirement,
  wallet: EvmWallet,
  verbose: boolean = false,
  logs: string[] = []
): Promise<X402PayResult> {
  const log = (msg: string) => { 
    if (verbose) { 
      logs.push(`[${new Date().toISOString()}] ${msg}`); 
      logs.push(''); 
    } 
  };

  log(`━━━ EVM Payment Handler START ━━━`);
  log(`  Network: ${evmReq.network}`);
  log(`  Amount: ${evmReq.maxAmountRequired} (raw) = ${Number(evmReq.maxAmountRequired) / 1e6} USDC`);
  log(`  Recipient: ${evmReq.payTo}`);
  log(`  Asset (USDC): ${evmReq.asset}`);

  // Get network config
  const networkConfig = NETWORK_MAP[evmReq.network];
  if (!networkConfig) {
    throw new Error(`Unsupported EVM network: ${evmReq.network}. Supported: ${EVM_NETWORKS.join(', ')}`);
  }
  log(`  Chain ID: ${networkConfig.chainId}`);

  // Create account from wallet
  const account = privateKeyToAccount(wallet.privateKey);
  log(`  Payer address: ${account.address}`);

  // Validate USDC address
  const usdcAddress = evmReq.asset as `0x${string}`;
  if (!usdcAddress) {
    throw new Error('No USDC asset address in payment requirements');
  }

  // Build EIP-3009 authorization
  log(`[EVM] Building EIP-3009 transferWithAuthorization...`);
  const authorization: Eip3009Authorization = {
    from: account.address,
    to: evmReq.payTo as `0x${string}`,
    value: evmReq.maxAmountRequired,
    validAfter: '0',
    validBefore: String(Math.floor(Date.now() / 1000) + 3600), // 1 hour
    nonce: ('0x' + Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')) as `0x${string}`,
  };
  log(`  Authorization: ${JSON.stringify(authorization, null, 2)}`);

  // EIP-712 domain
  const usdcName = evmReq.extra?.name ?? 'USD Coin';
  const usdcVersion = evmReq.extra?.version ?? '2';
  const domain = {
    name: usdcName,
    version: usdcVersion,
    chainId: networkConfig.chainId,
    verifyingContract: usdcAddress,
  };
  log(`  Domain: ${JSON.stringify(domain)}`);

  // EIP-712 types
  const authorizationTypes = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  // Sign the authorization
  log(`[EVM] Signing EIP-712 typed data...`);
  const signature = await account.signTypedData({
    domain,
    types: authorizationTypes,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  });
  log(`  Signature: ${signature.slice(0, 20)}...`);

  // Build x402 payment payload
  log(`[EVM] Building x402 payment payload...`);
  const paymentPayload = {
    x402Version: paymentRequired.x402Version ?? 1,
    scheme: 'exact',
    network: evmReq.network,
    payload: {
      signature,
      authorization,
    },
  };

  const payloadBase64 = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
  log(`  Payload base64 length: ${payloadBase64.length}`);

  // Retry request with X-PAYMENT header
  log(`[EVM] Sending paid request with X-PAYMENT header...`);
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

  // Extract txHash from response if available
  let settleTxHash = signature.slice(0, 66);
  if (typeof resBody === 'object' && resBody !== null) {
    const rb = resBody as Record<string, unknown>;
    if (typeof rb.txHash === 'string') {
      settleTxHash = rb.txHash;
    }
  }

  const amountHuman = (Number(evmReq.maxAmountRequired) / 1e6).toString();

  log(`━━━ EVM Payment Handler END ━━━`);
  log(`  Success: ${paidRes.ok}`);
  log(`  Amount: ${amountHuman} USDC`);

  return {
    success: paidRes.ok,
    statusCode: paidRes.status,
    headers: resHeaders,
    body: resBody,
    payment: {
      network: evmReq.network,
      amount: amountHuman,
      recipient: evmReq.payTo,
      txHash: settleTxHash,
    },
    note: paidRes.ok
      ? `EVM payment of ${amountHuman} USDC successful. Content delivered.`
      : `Payment signed but server returned ${paidRes.status}.`,
    logs: verbose ? logs : undefined,
  };
}
