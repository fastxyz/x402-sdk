# x402-sdk

SDK for the x402 HTTP Payment Protocol - monetize APIs with crypto payments.

## What is x402?

x402 is a payment protocol built on HTTP status code `402 Payment Required`. It enables:

- **Pay-per-request APIs**: Charge for individual API calls
- **No accounts needed**: Just sign and pay
- **Instant settlement**: Sub-second on Fast, ~15s on EVM
- **Multi-chain**: Fast, Arbitrum, Base, and more

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [x402-client](./packages/x402-client) | Client SDK - sign and pay for 402 content | `npm i @fast/x402-client` |
| [x402-server](./packages/x402-server) | Server SDK - protect routes, verify payments | `npm i @fast/x402-server` |
| [x402-facilitator](./packages/x402-facilitator) | Facilitator - verify signatures, settle on-chain | `npm i @fast/x402-facilitator` |

## Quick Start

### 1. Run a Facilitator

The facilitator verifies payment signatures and settles EVM payments on-chain.

```typescript
import express from 'express';
import { createFacilitatorServer } from '@fast/x402-facilitator';

const app = express();
app.use(express.json());

app.use(createFacilitatorServer({
  // Private key for settling EVM payments (pays gas)
  evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
}));

app.listen(4020, () => console.log('Facilitator on :4020'));
```

### 2. Protect Your API (Server)

```typescript
import express from 'express';
import { paymentMiddleware } from '@fast/x402-server';

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

### 3. Pay for Content (Client)

```typescript
import { x402Pay } from '@fast/x402-client';

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

### 4. Auto-Bridge: Pay EVM with Fast Funds

Provide both wallets to automatically bridge fastUSDC → USDC when paying for EVM endpoints:

```typescript
import { x402Pay } from '@fast/x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/api/premium/data',  // EVM endpoint
  wallet: [
    {
      type: 'fast',
      privateKey: '...',      // 32-byte Ed25519 key (hex)
      publicKey: '...',       // 32-byte pubkey (hex)
      address: 'fast1...',    // bech32m address
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
     │  (EIP-3009 or Fast tx)    │                                │
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
     │  200 OK (Fast)            │                                │
     │<─────────────────────────────│                                │
     │                              │                                │
     │                              │  POST /settle (EVM only)       │
     │                              │─────────────────────────────────>
     │                              │                                │
     │  200 OK (EVM)                │  { txHash: 0x... }             │
     │<─────────────────────────────│<─────────────────────────────────
```

## Payment Flows

### EVM (Arbitrum, Base, Ethereum)

Uses **EIP-3009 `transferWithAuthorization`** - client signs, facilitator settles.

```
Client                          Server                         Facilitator
  │                               │                                │
  │ Sign EIP-3009 authorization   │                                │
  │ (EIP-712 typed data)          │                                │
  │                               │                                │
  │ X-PAYMENT: { signature,       │                                │
  │   authorization: {from,to,    │                                │
  │   value,validAfter,           │                                │
  │   validBefore,nonce} }        │                                │
  │──────────────────────────────>│                                │
  │                               │  /verify                       │
  │                               │  - Recover signer from sig     │
  │                               │  - Check recipient matches     │
  │                               │  - Check amount sufficient     │
  │                               │  - Check timing valid          │
  │                               │  - Check on-chain balance      │
  │                               │────────────────────────────────>
  │                               │  { isValid: true }             │
  │                               │<────────────────────────────────
  │                               │                                │
  │                               │  /settle                       │
  │                               │  - Re-verify payment           │
  │                               │  - Check nonce not used        │
  │                               │  - Call transferWithAuth()     │
  │                               │  - Wait for confirmation       │
  │                               │────────────────────────────────>
  │                               │  { txHash: 0x... }             │
  │                               │<────────────────────────────────
  │  200 OK + content             │                                │
  │<──────────────────────────────│                                │
```

### Fast (Instant Settlement)

Client submits transaction directly, sends **certificate** as proof.

```
Client                          Server                         Facilitator
  │                               │                                │
  │ Submit TokenTransfer to       │                                │
  │ Fast network               │                                │
  │ (transaction already on-chain)│                                │
  │                               │                                │
  │ X-PAYMENT: {                  │                                │
  │   transactionCertificate: {   │                                │
  │     envelope: "0x...",        │                                │
  │     signatures: [...]         │                                │
  │   }                           │                                │
  │ }                             │                                │
  │──────────────────────────────>│                                │
  │                               │  /verify                       │
  │                               │  - Check certificate structure │
  │                               │  - (TODO: on-chain verify)     │
  │                               │────────────────────────────────>
  │                               │  { isValid: true }             │
  │                               │<────────────────────────────────
  │                               │                                │
  │  200 OK + content             │  (no /settle needed -          │
  │<──────────────────────────────│   already on-chain)            │
```

## Facilitator API

The facilitator exposes three endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/verify` | POST | Verify payment signature/certificate |
| `/settle` | POST | Settle payment on-chain (EVM only) |
| `/supported` | GET | List supported networks |

### Verification Logic

**EVM payments:**
1. Recover signer from EIP-712 signature (`verifyTypedData`)
2. Check recipient matches `paymentRequirement.payTo`
3. Check amount ≥ `paymentRequirement.maxAmountRequired`
4. Check `validAfter ≤ now < validBefore`
5. Query on-chain USDC balance

**Fast payments:**
1. Check certificate structure (envelope + signatures)
2. Validate scheme and network match
3. *(TODO: Query Fast RPC for on-chain verification)*

### Settlement Logic

**EVM:** Re-verify → Check nonce unused → Call `transferWithAuthorization()` → Wait for confirmation

**Fast:** No-op (transaction already on-chain when certificate was created)

## Multi-Network Server

Accept payments on both EVM and Fast:

```typescript
app.use(paymentMiddleware(
  {
    evm: '0x1234...',        // EVM payment address
    fast: 'fast1abc...',  // Fast payment address
  },
  {
    'GET /api/evm/*': { price: '$0.10', network: 'arbitrum-sepolia' },
    'GET /api/fast/*': { price: '$0.01', network: 'fast-testnet' },
  },
  { url: 'http://localhost:4020' }
));
```

## Supported Networks

| Network | Type | Chain ID | Token | Settlement |
|---------|------|----------|-------|------------|
| `fast-testnet` | Fast | - | fastUSDC | ~300ms |
| `fast-mainnet` | Fast | - | fastUSDC | ~300ms |
| `arbitrum-sepolia` | EVM | 421614 | USDC | ~15s |
| `arbitrum` | EVM | 42161 | USDC | ~15s |
| `base-sepolia` | EVM | 84532 | USDC | ~15s |
| `base` | EVM | 8453 | USDC | ~15s |
| `ethereum` | EVM | 1 | USDC | ~15s |

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build --workspaces

# Run tests
npm test --workspaces
```

## License

MIT
