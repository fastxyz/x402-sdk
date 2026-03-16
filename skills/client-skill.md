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
npm install @fastxyz/x402-client @fastxyz/sdk @fastxyz/allset-sdk
```

## Quick Start

```typescript
import { x402Pay } from '@fastxyz/x402-client';
import { FastWallet, FastProvider } from '@fastxyz/sdk';
import { createEvmWallet } from '@fastxyz/allset-sdk';

// Create wallets using SDKs
const fastProvider = new FastProvider({ network: 'testnet' });
const fastWallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', fastProvider);
const evmWallet = createEvmWallet('~/.allset/.evm/keys/default.json');

// Pay for any x402 endpoint
const result = await x402Pay({
  url: 'https://api.example.com/premium',
  wallet: [evmWallet, fastWallet],  // Both for auto-bridge support
});

console.log(result.body); // Paid content
```

## Architecture

**Dependencies:**
- `@fastxyz/sdk` - Fast wallet operations, transaction signing
- `@fastxyz/allset-sdk` - Auto-bridge from Fast to EVM via AllSet
- `viem` - EVM wallet operations, EIP-3009 signing

**Code structure:**
| File | Purpose |
|------|---------|
| `index.ts` | Main `x402Pay()` function, network routing |
| `types.ts` | Wallet and payment type definitions |
| `evm.ts` | EIP-3009 signing, balance checks, auto-bridge logic |
| `fast.ts` | Fast payment via `FastWallet.submit()` |
| `bridge.ts` | AllSet bridge wrapper |

## Wallet Types

### FastWallet (from @fastxyz/sdk)

```typescript
import { FastWallet, FastProvider } from '@fastxyz/sdk';

const provider = new FastProvider({ network: 'testnet' });

// From keyfile
const wallet = await FastWallet.fromKeyfile('~/.fast/keys/default.json', provider);

// From private key
const wallet = await FastWallet.fromPrivateKey('hex-private-key', provider);

// Generate new
const wallet = await FastWallet.create(provider);
```

### EvmWallet (from @fastxyz/allset-sdk)

```typescript
import { createEvmWallet } from '@fastxyz/allset-sdk';

// From keyfile
const wallet = createEvmWallet('~/.allset/.evm/keys/default.json');

// From private key
const wallet = createEvmWallet('0x...');

// Generate new
const wallet = createEvmWallet();
```

## Payment Flows

### Unified Flow (Recommended)

Provide both wallets - x402Pay handles any payment requirement:

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/protected-resource',
  wallet: [fastWallet, evmWallet],
});

console.log('Network:', result.payment?.network);  // 'fast-testnet' or 'arbitrum-sepolia'
console.log('Bridged:', result.payment?.bridged);  // true if auto-bridged
```

**Routing logic:**
1. Server returns 402 with accepted networks
2. SDK matches your wallets to server requirements
3. Prefers Fast network (faster, ~300ms)
4. Falls back to EVM with auto-bridge if needed

### Fast Payment

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/fast-endpoint',
  wallet: fastWallet,
});
```

**Speed:** ~300ms

### EVM Payment

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: evmWallet,
});
```

**Speed:** ~5s (chain confirmation)

### Auto-Bridge

When both wallets provided and EVM payment required with insufficient EVM balance:

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: [fastWallet, evmWallet],
  verbose: true,
});

if (result.payment?.bridged) {
  console.log('Auto-bridged via:', result.payment.bridgeTxHash);
}
```

**Flow:**
1. Check EVM USDC balance → insufficient
2. Check Fast testUSDC balance → sufficient
3. Bridge via AllSet (~3-4s)
4. Complete EVM payment

**Token mapping:**
- Testnet: `testUSDC` → `USDC`
- Mainnet: `fastUSDC` → `USDC`

## API Reference

### x402Pay

```typescript
const result = await x402Pay({
  url: string,              // Required: URL to pay for
  wallet: Wallet | Wallet[],// Required: FastWallet and/or EvmWallet
  method?: string,          // HTTP method (default: 'GET')
  headers?: Headers,        // Additional headers
  body?: any,               // Request body
  verbose?: boolean,        // Log progress (default: false)
});
```

### Result

```typescript
interface X402PayResult {
  success: boolean;
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  payment?: {
    network: string;        // Network used
    amount: string;         // Amount paid
    recipient: string;
    txHash: string;
    bridged?: boolean;
    bridgeTxHash?: string;
  };
  note: string;
  logs?: string[];          // If verbose=true
}
```

### Type Guards

```typescript
import { isFastWallet, isEvmWallet } from '@fastxyz/x402-client';

if (isFastWallet(wallet)) {
  // wallet is FastWallet from @fastxyz/sdk
}

if (isEvmWallet(wallet)) {
  // wallet is EvmWallet from @fastxyz/allset-sdk
}
```

## Supported Networks

| Network | Type | Token |
|---------|------|-------|
| `fast-testnet` | Fast | testUSDC |
| `fast-mainnet` | Fast | fastUSDC |
| `arbitrum-sepolia` | EVM | USDC |
| `arbitrum` | EVM | USDC |
| `ethereum-sepolia` | EVM | USDC |
| `ethereum` | EVM | USDC |

## Troubleshooting

### `INSUFFICIENT_BALANCE`
- Check token balance on required network
- Provide Fast wallet for auto-bridge on EVM payments

### `BRIDGE_TIMEOUT`
- AllSet bridge typically takes 3-4s
- Check Fast wallet has testUSDC/fastUSDC

### Debug mode

```typescript
const result = await x402Pay({
  url: '...',
  wallet: [...],
  verbose: true,
});
result.logs?.forEach(console.log);
```
