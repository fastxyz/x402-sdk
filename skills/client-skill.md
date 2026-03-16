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
  "@fastxyz/sdk": "^0.1.6",
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
// Fast wallet config
const fastWallet = {
  type: 'fast' as const,
  privateKey: '...',    // 32-byte Ed25519 seed (hex, no 0x)
  address: 'fast1...',  // bech32m address
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
// ─── From @fastxyz/sdk ────────────────────────────────────────────────────────

/**
 * FastWallet class - manages Ed25519 keys and Fast network operations
 */
class FastWallet {
  /** bech32m address (fast1...) */
  readonly address: string;
  
  /** Create from hex private key */
  static fromPrivateKey(privateKey: string, provider: FastProvider): Promise<FastWallet>;
  
  /** Load from keyfile (~/.fast/keys/*.json) */
  static fromKeyfile(path: string, provider: FastProvider): Promise<FastWallet>;
  
  /** Generate new wallet */
  static generate(provider: FastProvider): Promise<FastWallet>;
  
  /** Send tokens (returns txHash) */
  send(params: { to: string; amount: string; token?: string }): Promise<SendResult>;
  
  /** Submit transaction (returns txHash + certificate) */
  submit(params: { recipient: string; claim: object }): Promise<SubmitResult>;
  
  /** Sign a message */
  sign(params: { message: string | Uint8Array }): Promise<SignResult>;
}

// ─── From @fastxyz/allset-sdk ─────────────────────────────────────────────────

interface EvmWallet {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

// ─── Simple Config Formats ────────────────────────────────────────────────────

interface FastWalletConfig {
  type: 'fast';
  privateKey: string;   // Hex-encoded Ed25519 private key (no 0x)
  address: string;      // bech32m address (fast1...)
  rpcUrl?: string;      // Optional custom RPC endpoint
}

interface EvmWalletConfig {
  type: 'evm';
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

// ─── Combined Type ────────────────────────────────────────────────────────────

// x402-client accepts all of these
type Wallet = FastWallet | EvmWallet | FastWalletConfig | EvmWalletConfig;
```

## Payment Flows

### Unified Flow (Recommended)

**Provide both Fast and EVM wallets** - x402Pay automatically handles any payment requirement:

```typescript
import { x402Pay } from '@fastxyz/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/protected-resource',
  wallet: [fastWallet, evmWallet],  // Order doesn't matter
  verbose: true,
});
```

The SDK intelligently routes based on what the server accepts:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              x402Pay Flow                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Initial Request → Server returns 402 with accepted networks             │
│                                                                             │
│  2. Match network to wallet:                                                │
│     ┌─────────────────────────────────────────────────────────────────┐     │
│     │ Server accepts: fast-testnet, arbitrum-sepolia                  │     │
│     │ You provided: [fastWallet, evmWallet]                           │     │
│     └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  3. Route to payment path (Fast preferred for speed):                       │
│                                                                             │
│     ┌──────────────────────┐      ┌──────────────────────────────────┐     │
│     │  FAST NETWORK PATH   │      │      EVM NETWORK PATH            │     │
│     │  (fast-testnet, etc) │      │  (arbitrum-sepolia, base, etc)   │     │
│     ├──────────────────────┤      ├──────────────────────────────────┤     │
│     │                      │      │                                  │     │
│     │  FastWallet.submit() │      │  Check EVM USDC balance          │     │
│     │         │            │      │         │                        │     │
│     │         ▼            │      │         ▼                        │     │
│     │  Get certificate     │      │  ┌─────────────────────────┐     │     │
│     │         │            │      │  │ Sufficient balance?     │     │     │
│     │         ▼            │      │  └──────────┬──────────────┘     │     │
│     │  Send X-PAYMENT      │      │       YES   │   NO               │     │
│     │         │            │      │         │   │   │                │     │
│     │         ▼            │      │         │   ▼   ▼                │     │
│     │  ✓ Done (~300ms)     │      │         │  Auto-Bridge           │     │
│     │                      │      │         │  (sendToExternal)      │     │
│     └──────────────────────┘      │         │   │                    │     │
│                                   │         │   ▼                    │     │
│                                   │         │  Wait for USDC arrival │     │
│                                   │         │   │                    │     │
│                                   │         ▼   ▼                    │     │
│                                   │  Sign EIP-3009 authorization     │     │
│                                   │         │                        │     │
│                                   │         ▼                        │     │
│                                   │  Send X-PAYMENT                  │     │
│                                   │         │                        │     │
│                                   │         ▼                        │     │
│                                   │  ✓ Done (~5s, or ~8s if bridged) │     │
│                                   └──────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Example with both wallets:**

```typescript
import { FastProvider, FastWallet } from '@fastxyz/sdk';
import { createEvmWallet } from '@fastxyz/allset-sdk';
import { x402Pay } from '@fastxyz/x402-client';

// Setup wallets once
const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const evmWallet = await createEvmWallet();

// Pay for any x402 endpoint - SDK figures out the rest
const result = await x402Pay({
  url: 'https://api.example.com/premium-data',
  wallet: [fastWallet, evmWallet],
});

// Check what path was used
console.log('Network:', result.payment?.network);      // 'fast-testnet' or 'arbitrum-sepolia'
console.log('Amount:', result.payment?.amount);        // '0.10' (human-readable)
console.log('Bridged:', result.payment?.bridged);      // true if auto-bridged
console.log('Data:', result.body);
```

### Fast-Only Payment

If you only have a Fast wallet:

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/fast-endpoint',
  wallet: fastWallet,
});
```

Flow:
1. Fetch URL → receive 402 with payment requirements
2. Submit TokenTransfer using `FastWallet.submit()`
3. Send request with transaction certificate in `X-PAYMENT`
4. Server verifies certificate
5. Server returns content (already settled on-chain)

**Speed:** ~300ms total

### EVM-Only Payment

If you only have an EVM wallet:

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: evmWallet,
});
```

Flow:
1. Fetch URL → receive 402 with payment requirements
2. Sign EIP-3009 `transferWithAuthorization`
3. Send request with `X-PAYMENT` header
4. Facilitator verifies signature and settles on-chain
5. Server returns content

**Speed:** ~5s (depends on chain confirmation)

**Note:** Without a Fast wallet, auto-bridge is not available. If EVM balance is insufficient, the payment will fail.

### Auto-Bridge Details

When both wallets are provided and an EVM payment is required:

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: [fastWallet, evmWallet],
  verbose: true,  // See bridge progress in logs
});

if (result.payment?.bridged) {
  console.log('Auto-bridged!');
  console.log('Fast tx:', result.payment.bridgeTxHash);
}
```

**Auto-bridge flow:**
1. Server requires EVM payment (e.g., `arbitrum-sepolia`)
2. Check EVM wallet USDC balance → insufficient
3. Check Fast wallet testUSDC/fastUSDC balance → sufficient
4. Execute `AllSetProvider.sendToExternal()`:
   - Transfer testUSDC to Fast bridge address
   - Cross-sign the transaction
   - Submit to relayer
5. Poll EVM USDC balance until funds arrive (~3-4s)
6. Sign EIP-3009 authorization with now-funded EVM wallet
7. Complete payment

**Token mapping:**
- Testnet: `testUSDC` (Fast) → `USDC` (EVM)
- Mainnet: `fastUSDC` (Fast) → `USDC` (EVM)

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
| `ethereum-sepolia` | EVM | USDC | (viem default) |
| `ethereum` | EVM | USDC | (viem default) |
