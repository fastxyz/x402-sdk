---
name: x402-sdk
description: >
  x402 HTTP Payment Protocol SDK for monetizing APIs with crypto payments. Use when the user wants to
  add pay-per-request to an API, protect routes with payment requirements, build a payment client
  that handles 402 responses, run a facilitator service, or debug x402 payment flows.
  Trigger this skill for EIP-3009 authorization signing, Fast certificate handling, auto-bridge flows,
  or any work involving @fastxyz/x402-client, @fastxyz/x402-server, or @fastxyz/x402-facilitator.
  Do NOT use for generic wallet operations, token swaps, staking, or non-payment SDK work.
metadata:
  version: 0.1.0
---

# x402 SDK

Use this skill for work in this repository or in another codebase that needs to consume these packages.

It assumes Node.js 18+ and network access to EVM RPCs, Fast RPC, and a running facilitator service.

## What is x402?

x402 is a payment protocol built on HTTP status code `402 Payment Required`. It enables:

- **Pay-per-request APIs**: Charge for individual API calls
- **No accounts needed**: Just sign and pay
- **Instant settlement**: Sub-second on Fast, ~15s on EVM
- **Multi-chain**: Fast, Arbitrum, Base, and more

## Packages

| Package | Description |
|---------|-------------|
| `@fastxyz/x402-client` | Client SDK - sign and pay for 402 content |
| `@fastxyz/x402-server` | Server SDK - protect routes, verify payments |
| `@fastxyz/x402-facilitator` | Facilitator - verify signatures, settle on-chain |

## Current Support Matrix

Before writing code, check these constraints:

**Supported Networks:**

| Network | Type | Chain ID | Token | Settlement |
|---------|------|----------|-------|------------|
| `fast-testnet` | Fast | - | fastUSDC | ~300ms |
| `fast-mainnet` | Fast | - | fastUSDC | ~300ms |
| `arbitrum-sepolia` | EVM | 421614 | USDC | ~15s |
| `arbitrum` | EVM | 42161 | USDC | ~15s |
| `base-sepolia` | EVM | 84532 | USDC | ~15s |
| `base` | EVM | 8453 | USDC | ~15s |
| `ethereum` | EVM | 1 | USDC | ~15s |

**Payment Flows:**

- EVM: Uses EIP-3009 `transferWithAuthorization` - client signs, facilitator settles
- Fast: Client submits tx directly, sends certificate as proof (no facilitator settle needed)
- Auto-bridge: Client can bridge fastUSDC → USDC when paying EVM endpoints

## Files To Read

Read only what you need:

**x402-client:**
- `packages/x402-client/src/index.ts` - Main `x402Pay()` function and exports
- `packages/x402-client/src/types.ts` - Wallet types, payment types
- `packages/x402-client/src/evm.ts` - EIP-3009 signing logic
- `packages/x402-client/src/fast.ts` - Fast transaction signing
- `packages/x402-client/src/bridge.ts` - Auto-bridge logic (Fast → EVM)

**x402-server:**
- `packages/x402-server/src/index.ts` - Public exports
- `packages/x402-server/src/middleware.ts` - `paymentMiddleware()` implementation
- `packages/x402-server/src/payment.ts` - Payment verification/settlement helpers
- `packages/x402-server/src/types.ts` - Route config, payment requirement types

**x402-facilitator:**
- `packages/x402-facilitator/src/index.ts` - Public exports
- `packages/x402-facilitator/src/server.ts` - Express server factory
- `packages/x402-facilitator/src/verify.ts` - Signature verification
- `packages/x402-facilitator/src/settle.ts` - On-chain settlement

## Workflow

### 1. Classify the task

- **Client integration**: Using `x402Pay()` to pay for protected content
- **Server protection**: Adding `paymentMiddleware()` to protect routes
- **Facilitator setup**: Running a facilitator service
- **Auto-bridge**: Paying EVM endpoints with Fast funds
- **Debugging**: Interpreting 402 responses or payment errors

### 2. Facilitator Setup

The facilitator verifies payment signatures and settles EVM payments on-chain.

```typescript
import express from 'express';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';

const app = express();
app.use(express.json());

app.use(createFacilitatorServer({
  // Private key for settling EVM payments (pays gas)
  evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
}));

app.listen(4020, () => console.log('Facilitator on :4020'));
```

**Facilitator Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/verify` | POST | Verify payment signature/certificate |
| `/settle` | POST | Settle payment on-chain (EVM only) |
| `/supported` | GET | List supported networks |

### 3. Protect Routes (Server)

```typescript
import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';

const app = express();

app.use(paymentMiddleware(
  '0x1234...',  // Your payment address
  {
    'GET /api/premium/*': { price: '$0.10', network: 'arbitrum-sepolia' },
  },
  { url: 'http://localhost:4020' }  // Facilitator URL
));

app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'Premium content!' });
});

app.listen(3000);
```

**Multi-network server:**

```typescript
app.use(paymentMiddleware(
  {
    evm: '0x1234...',        // EVM payment address
    fast: 'fast1abc...',     // Fast payment address
  },
  {
    'GET /api/evm/*': { price: '$0.10', network: 'arbitrum-sepolia' },
    'GET /api/fast/*': { price: '$0.01', network: 'fast-testnet' },
  },
  { url: 'http://localhost:4020' }
));
```

### 4. Pay for Content (Client)

**Simple EVM payment:**

```typescript
import { x402Pay } from '@fastxyz/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/api/premium/data',
  wallet: {
    type: 'evm',
    privateKey: '0x...',
    address: '0x...',
  },
});

console.log(result.body); // Your paid content
```

**Simple Fast payment:**

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/api/fast/data',
  wallet: {
    type: 'fast',
    privateKey: '...',      // 32-byte Ed25519 seed (hex)
    publicKey: '...',       // 32-byte pubkey (hex)
    address: 'fast1...',    // bech32m address
  },
});
```

**Auto-bridge (Fast → EVM):**

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/api/premium/data',  // EVM endpoint
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
  verbose: true,  // See bridge progress logs
});

// Flow:
// 1. Detects EVM endpoint requires USDC
// 2. Checks EVM USDC balance (insufficient)
// 3. Bridges fastUSDC → USDC via AllSet (~3-4s)
// 4. Signs EIP-3009 authorization
// 5. Sends payment → 200 OK
```

## Protocol Flow

```
┌─────────┐                    ┌─────────┐                    ┌─────────────┐
│  Client │                    │  Server │                    │ Facilitator │
└────┬────┘                    └────┬────┘                    └──────┬──────┘
     │                              │                                │
     │  GET /api/data               │                                │
     │─────────────────────────────>│                                │
     │                              │                                │
     │  402 Payment Required        │                                │
     │  { accepts: [...] }          │                                │
     │<─────────────────────────────│                                │
     │                              │                                │
     │  Sign payment                │                                │
     │  (EIP-3009 or Fast tx)       │                                │
     │                              │                                │
     │  GET /api/data               │                                │
     │  X-PAYMENT: <signed>         │                                │
     │─────────────────────────────>│                                │
     │                              │                                │
     │                              │  POST /verify                  │
     │                              │─────────────────────────────────>
     │                              │                                │
     │                              │  { isValid: true }             │
     │                              │<─────────────────────────────────
     │                              │                                │
     │  200 OK (Fast)               │                                │
     │<─────────────────────────────│                                │
     │                              │                                │
     │                              │  POST /settle (EVM only)       │
     │                              │─────────────────────────────────>
     │                              │                                │
     │  200 OK (EVM)                │  { txHash: 0x... }             │
     │<─────────────────────────────│<─────────────────────────────────
```

## Payment Flow Details

### EVM Payment (EIP-3009)

1. Client signs EIP-712 typed data for `transferWithAuthorization`
2. Server receives `X-PAYMENT` header with signature + authorization params
3. Facilitator `/verify`: Recovers signer, checks recipient/amount/timing/balance
4. Facilitator `/settle`: Calls `transferWithAuthorization()` on USDC contract
5. Server returns content after settlement confirmation

### Fast Payment

1. Client submits TokenTransfer to Fast network directly
2. Client sends transaction certificate (envelope + committee signatures) in `X-PAYMENT`
3. Facilitator `/verify`: Validates certificate structure
4. No `/settle` needed - transaction already on-chain
5. Server returns content immediately

## Troubleshooting

### 402 Response Structure

When a route requires payment, server returns:

```json
{
  "error": "Payment Required",
  "accepts": [{
    "scheme": "exact",
    "network": "arbitrum-sepolia",
    "maxAmountRequired": "100000",
    "resource": "https://api.example.com/api/premium/data",
    "payTo": "0x1234...",
    "maxTimeoutSeconds": 60,
    "mimeType": "application/json",
    "outputSchema": null,
    "extra": null
  }]
}
```

### Common Errors

**`INSUFFICIENT_BALANCE`**
- Check token balance on the required network
- For auto-bridge: ensure Fast wallet has sufficient fastUSDC

**`INVALID_SIGNATURE`**
- EVM: Check EIP-712 domain (name, version, chainId, verifyingContract)
- Fast: Verify Ed25519 key pair matches the `fast1...` address

**`SETTLEMENT_FAILED`**
- Check facilitator has ETH for gas
- Check USDC contract address is correct for network
- Check nonce hasn't been used already

**`BRIDGE_TIMEOUT`**
- AllSet bridge typically takes 3-4 seconds
- Default timeout is 20 minutes; increase if network is slow

### Debug with verbose mode

```typescript
const result = await x402Pay({
  url: '...',
  wallet: [...],
  verbose: true,  // Logs each step
});
```

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Dry-run pack
npm run pack:dry-run

# Smoke test packages
npm run pack:smoke
```

## Common Requests This Skill Should Trigger On

- "Add x402 payment protection to my Express API"
- "Use x402Pay to access a paid endpoint"
- "Set up a facilitator service for EVM payments"
- "Bridge Fast funds to pay for an EVM endpoint"
- "Debug why my 402 payment is failing"
- "Add support for a new network in x402"
- "Integrate x402-client into my app"

## Requests This Skill Should Not Own

- Generic wallet creation or management
- Token swaps or DEX operations
- Staking, lending, or yield strategies
- Non-payment HTTP client work
- AllSet bridge operations outside x402 context (use allset-sdk)
- Fast wallet operations outside x402 context (use fast-sdk)
