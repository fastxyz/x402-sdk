---
name: x402-client
description: >
  Client SDK for paying 402-protected APIs. Use when the user wants to pay for content behind a 402 paywall,
  sign EIP-3009 authorizations for EVM payments, submit Fast transaction certificates, or auto-bridge
  fastUSDC to USDC when paying EVM endpoints. Trigger on x402Pay, payment signing, or 402 response handling.
metadata:
  package: "@fastxyz/x402-client"
  version: 0.1.0
---

# x402-client

Pay for 402-protected content with crypto. Handles EVM (EIP-3009) and Fast payment flows.

## Dependencies

```json
{
  "@fastxyz/sdk": "^0.1.5",
  "@fastxyz/allset-sdk": "^0.1.2",
  "viem": "^2.46.2"
}
```

## Install

```bash
npm install @fastxyz/x402-client
```

## Quick Start

```typescript
import { x402Pay } from '@fastxyz/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: {
    type: 'evm',
    privateKey: '0x...',
    address: '0x...',
  },
});

console.log(result.body); // Paid content
```

## Architecture

**Internal dependencies:**
- `@fastxyz/sdk` - Fast wallet operations, transaction signing, BCS serialization
- `@fastxyz/allset-sdk` - Auto-bridge from Fast to EVM via AllSet
- `viem` - EVM wallet operations, EIP-3009 signing

**Code structure:**
| File | Purpose |
|------|---------|
| `index.ts` | Main `x402Pay()` function, network routing |
| `types.ts` | Wallet and payment type definitions, type guards |
| `evm.ts` | EIP-3009 signing, balance checks |
| `fast.ts` | Fast payment via `FastWallet.submit()` |
| `bridge.ts` | AllSet bridge wrapper for auto-bridge |

## Wallet Types

x402-client accepts wallets in two formats:

1. **SDK class instances** (recommended) - Use wallets from `@fastxyz/sdk` and `@fastxyz/allset-sdk`
2. **Simple config objects** (legacy) - Plain objects with keys and addresses

### Option 1: SDK Wallet Classes (Recommended)

Use wallet classes from the underlying SDKs for better integration:

```typescript
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { createEvmWallet } from '@fastxyz/allset-sdk';
import { x402Pay } from '@fastxyz/x402-client';

// Create Fast wallet from @fastxyz/sdk
const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);

// Create EVM wallet from @fastxyz/allset-sdk
const evmWallet = await createEvmWallet(); // Loads from ~/.allset/.evm/keys/default.json

// Use directly with x402Pay
const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: [fastWallet, evmWallet],
});
```

**Benefits:**
- Single source of truth for wallet management
- Type-safe integration
- Consistent key storage (`~/.fast/keys/`, `~/.allset/.evm/keys/`)

### Option 2: Simple Config Objects (Legacy)

Plain objects work too, useful for quick scripts or when you have raw keys:

```typescript
// Fast wallet config (only privateKey required!)
const fastWallet = {
  type: 'fast' as const,
  privateKey: '...',    // 32-byte Ed25519 seed (hex, no 0x) - REQUIRED
  // publicKey and address are derived automatically if not provided
  rpcUrl: 'https://testnet.api.fast.xyz/proxy', // optional
};

// EVM wallet config
const evmWallet = {
  type: 'evm' as const,
  privateKey: '0x...',  // 32-byte hex with 0x prefix
  address: '0x...',     // EVM address
};
```

### Type Definitions

```typescript
// From @fastxyz/sdk
import { FastWallet } from '@fastxyz/sdk';

// From @fastxyz/allset-sdk
interface EvmWallet {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

// Legacy config formats
interface FastWalletConfig {
  type: 'fast';
  privateKey: string;   // Required - everything else derived from this
  publicKey?: string;   // Optional
  address?: string;     // Optional
  rpcUrl?: string;      // Optional
}

interface EvmWalletConfig {
  type: 'evm';
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

// x402-client accepts all of these
type Wallet = FastWallet | EvmWallet | FastWalletConfig | EvmWalletConfig;
```

## Payment Flows

### EVM Payment

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: evmWallet,  // Either SDK class or config object
});
```

Flow:
1. Fetch URL → receive 402 with payment requirements
2. Sign EIP-3009 `transferWithAuthorization`
3. Send request with `X-PAYMENT` header
4. Facilitator verifies signature and settles on-chain
5. Server returns content

### Fast Payment

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/fast-endpoint',
  wallet: fastWallet,  // Either SDK class or config object
});
```

Flow:
1. Fetch URL → receive 402 with payment requirements
2. Submit TokenTransfer using `FastWallet.submit()` from @fastxyz/sdk
3. Send request with transaction certificate in `X-PAYMENT`
4. Server verifies certificate
5. Server returns content (no settlement needed - already on-chain)

### Auto-Bridge (Fast → EVM)

Provide both wallets to automatically bridge when EVM balance is insufficient:

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: [fastWallet, evmWallet],  // Order doesn't matter
  verbose: true,  // Log bridge progress
});

// Check if bridging occurred
if (result.payment?.bridged) {
  console.log('Auto-bridged via:', result.payment.bridgeTxHash);
}
```

Flow:
1. Detect EVM endpoint requires USDC
2. Check EVM USDC balance → insufficient
3. Check Fast fastUSDC/testUSDC balance → sufficient
4. Bridge via `AllSetProvider.sendToExternal()` (~3-4s)
5. Sign EIP-3009 authorization
6. Complete payment

## Technical Details

### Fast Payment Internals

Uses `FastWallet.submit()` for certificate-inclusive transactions:

```typescript
// Internal flow in fast.ts
// If SDK wallet class is provided, use directly
// If config object, create FastWallet from privateKey

const result = await fastWallet.submit({
  recipient: payTo,
  claim: {
    TokenTransfer: {
      token_id: tokenIdBytes,
      amount: hexAmount,
      user_data: null,
    },
  },
});

// result.certificate contains the full transaction certificate
```

### Auto-Bridge Internals

Uses `@fastxyz/allset-sdk` for bridging:

```typescript
// Internal flow in bridge.ts
const allset = new AllSetProvider({ network: 'testnet' });

const result = await allset.sendToExternal({
  chain: 'arbitrum',
  token: 'testUSDC',  // or 'fastUSDC' on mainnet
  amount: amountString,
  from: fastWalletAddress,
  to: evmAddress,
  fastWallet: sdkFastWallet,  // Resolved from input wallet
});
```

### Type Guards

The SDK provides type guards for runtime wallet detection:

```typescript
import { 
  isFastWallet,
  isEvmWallet,
  isFastWalletClass,
  isFastWalletConfig,
} from '@fastxyz/x402-client';

// Check any wallet type
if (isFastWallet(wallet)) {
  // wallet is FastWallet (class or config)
}

// Distinguish class from config
if (isFastWalletClass(wallet)) {
  // wallet is FastWallet class from @fastxyz/sdk
  await wallet.submit({ ... });
} else if (isFastWalletConfig(wallet)) {
  // wallet is simple config object
  console.log(wallet.privateKey);
}
```

## Options

```typescript
const result = await x402Pay({
  url: string,              // Required: URL to pay for
  wallet: Wallet | Wallet[],// Required: Single wallet or array for auto-bridge
  method?: string,          // HTTP method (default: 'GET')
  headers?: Headers,        // Additional headers
  body?: any,               // Request body for POST/PUT
  verbose?: boolean,        // Log progress (default: false)
});
```

## Return Value

```typescript
interface X402PayResult {
  success: boolean;         // Request succeeded
  statusCode: number;       // HTTP status
  headers: Record<string, string>;
  body: unknown;            // Response body
  payment?: {
    network: string;        // Network used
    amount: string;         // Amount paid (human-readable)
    recipient: string;      // Recipient address
    txHash: string;         // Transaction hash
    bridged?: boolean;      // True if auto-bridged
    bridgeTxHash?: string;  // Bridge tx hash if bridged
  };
  note: string;             // Human-readable summary
  logs?: string[];          // Debug logs if verbose=true
}
```

## Troubleshooting

### `INSUFFICIENT_BALANCE`
- Check token balance on the required network
- For auto-bridge: ensure Fast wallet has sufficient fastUSDC/testUSDC

### `INVALID_SIGNATURE`  
- EVM: Check private key matches address
- Fast: Verify Ed25519 key pair derives to the `fast1...` address

### `BRIDGE_TIMEOUT`
- AllSet bridge typically takes 3-4 seconds
- Increase timeout if network is slow
- Check Fast wallet has fastUSDC/testUSDC balance

### Debug mode

```typescript
const result = await x402Pay({
  url: '...',
  wallet: [...],
  verbose: true,  // Logs each step
});

// Check logs
result.logs?.forEach(console.log);
```

## Supported Networks

| Network | Type | Token | RPC Endpoint |
|---------|------|-------|--------------|
| `fast-testnet` | Fast | testUSDC | testnet.api.fast.xyz |
| `fast-mainnet` | Fast | fastUSDC | api.fast.xyz |
| `arbitrum-sepolia` | EVM | USDC | (viem default) |
| `arbitrum` | EVM | USDC | (viem default) |
| `base-sepolia` | EVM | USDC | (viem default) |
| `base` | EVM | USDC | (viem default) |
| `ethereum` | EVM | USDC | (viem default) |
