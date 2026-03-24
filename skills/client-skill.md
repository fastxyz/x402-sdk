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

## Files To Read

- `packages/x402-client/src/index.ts` - Main `x402Pay()` function
- `packages/x402-client/src/types.ts` - Wallet and payment types
- `packages/x402-client/src/evm.ts` - EIP-3009 signing
- `packages/x402-client/src/fast.ts` - Fast transaction signing
- `packages/x402-client/src/bridge.ts` - Auto-bridge logic

## Wallet Types

### EVM Wallet

```typescript
const wallet = {
  type: 'evm',
  privateKey: '0x...',  // 32-byte hex with 0x prefix
  address: '0x...',     // EVM address
};
```

### Fast Wallet

```typescript
const wallet = {
  type: 'fast',
  privateKey: '...',    // 32-byte Ed25519 seed (hex, no 0x)
  publicKey: '...',     // 32-byte pubkey (hex)
  address: 'fast1...',  // bech32m address
};
```

## Payment Flows

### EVM Payment

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: {
    type: 'evm',
    privateKey: '0x...',
    address: '0x...',
  },
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
  wallet: {
    type: 'fast',
    privateKey: '...',
    publicKey: '...',
    address: 'fast1...',
  },
});
```

Flow:
1. Fetch URL → receive 402 with payment requirements
2. Submit TokenTransfer to Fast network
3. Send request with transaction certificate in `X-PAYMENT`
4. Server verifies certificate
5. Server returns content (no settlement needed - already on-chain)

### Auto-Bridge (Fast → EVM)

Provide both wallets to automatically bridge when EVM balance is insufficient:

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/evm-endpoint',
  wallet: [
    {
      type: 'fast',
      privateKey: '...',
      publicKey: '...',
      address: 'fast1...',
    },
    {
      type: 'evm',
      privateKey: '0x...',
      address: '0x...',
    },
  ],
  verbose: true,  // Log bridge progress
});
```

Flow:
1. Detect EVM endpoint requires USDC
2. Check EVM USDC balance → insufficient
3. Check Fast fastUSDC balance → sufficient
4. Bridge fastUSDC → USDC via AllSet (~3-4s)
5. Sign EIP-3009 authorization
6. Complete payment

## Options

```typescript
const result = await x402Pay({
  url: string,              // Required: URL to pay for
  wallet: Wallet | Wallet[],// Required: Single wallet or [fast, evm] for auto-bridge
  method?: string,          // HTTP method (default: 'GET')
  headers?: Headers,        // Additional headers
  body?: any,               // Request body for POST/PUT
  verbose?: boolean,        // Log progress (default: false)
});
```

## Return Value

```typescript
interface X402PayResult {
  response: Response;       // Raw fetch Response
  body: any;                // Parsed response body
  paymentInfo: {
    network: string;        // Network used
    amount: string;         // Amount paid
    txHash?: string;        // Transaction hash (if available)
  };
}
```

## Troubleshooting

### `INSUFFICIENT_BALANCE`
- Check token balance on the required network
- For auto-bridge: ensure Fast wallet has sufficient fastUSDC

### `INVALID_SIGNATURE`  
- EVM: Check private key matches address
- Fast: Verify Ed25519 key pair derives to the `fast1...` address

### `BRIDGE_TIMEOUT`
- AllSet bridge typically takes 3-4 seconds
- Increase timeout if network is slow
- Check Fast wallet has fastUSDC balance

### Debug mode

```typescript
const result = await x402Pay({
  url: '...',
  wallet: [...],
  verbose: true,  // Logs each step
});
```

## Supported Networks

| Network | Type | Token |
|---------|------|-------|
| `fast-testnet` | Fast | fastUSDC |
| `fast-mainnet` | Fast | fastUSDC |
| `ethereum-sepolia` | EVM | USDC |
| `arbitrum-sepolia` | EVM | USDC |
| `arbitrum` | EVM | USDC |
| `base` | EVM | USDC |
