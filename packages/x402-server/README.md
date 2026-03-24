# x402-server

Server SDK for the [x402 HTTP payment protocol](https://github.com/Pi-Squared-Inc/x402-sdk).

Protect API routes with crypto payments — works with Express and compatible frameworks.

## Install

```bash
npm install @fastxyz/x402-server
```

## Quick Start

```typescript
import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';

const app = express();

// Protect routes with payment requirements
app.use(paymentMiddleware(
  "0x1234567890abcdef...",  // Your payment address
  {
    "GET /api/premium/*": { price: "$0.10", network: "arbitrum-sepolia" },
    "POST /api/generate": { price: "$0.50", network: "base-sepolia" },
  },
  { url: "http://localhost:4020" }  // Facilitator URL
));

app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'Premium content!' });
});

app.listen(3000);
```

## Multi-Network Support (EVM + Fast)

Accept payments on both EVM and Fast networks:

```typescript
app.use(paymentMiddleware(
  {
    evm: "0x1234567890abcdef...",     // Receives EVM payments
    fast: "fast1abc123xyz...",      // Receives Fast payments
  },
  {
    "GET /api/evm/data": { price: "$0.10", network: "arbitrum-sepolia" },
    "GET /api/fast/data": { price: "$0.01", network: "fast-testnet" },
  },
  { url: "http://localhost:4020" }
));
```

## How It Works

The middleware intercepts requests and handles payment verification:

### Fast Payments (Already On-Chain)
```
Client signs & submits TokenTransfer → Gets certificate
                    ↓
Request with X-PAYMENT (certificate) → Server
                    ↓
Server calls Facilitator /verify → Certificate valid?
                    ↓
              ✅ Serve Content
```
Fast payments are submitted by the client before the request. The server only verifies the transaction certificate — no settlement step needed.

### EVM Payments (Authorization Only)
```
Client signs EIP-3009 authorization
                    ↓
Request with X-PAYMENT (signature) → Server
                    ↓
Server calls Facilitator /verify → Signature valid?
                    ↓
Server calls Facilitator /settle → Submit on-chain
                    ↓
              ✅ Serve Content
```
EVM payments use EIP-3009 `transferWithAuthorization`. The client signs an authorization, but the facilitator must submit it on-chain before content is served.

## API

### paymentMiddleware

```typescript
import { paymentMiddleware } from '@fastxyz/x402-server';

paymentMiddleware(payTo, routes, facilitator)
```

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| `payTo` | `string \| { evm?: string, fast?: string }` | Payment address(es) |
| `routes` | `Record<string, RouteConfig>` | Route patterns → payment config |
| `facilitator` | `FacilitatorConfig` | Facilitator service config |

### RouteConfig

```typescript
interface RouteConfig {
  price: string;      // "$0.10", "0.1 USDC", or "100000" (raw units)
  network: string;    // "arbitrum-sepolia", "fast-testnet", etc.
  config?: {
    description?: string;
    mimeType?: string;
    asset?: string;   // Custom token address (defaults to USDC)
  };
}
```

**Route patterns:**
- `"/api/data"` — matches any HTTP method
- `"GET /api/data"` — matches GET only
- `"/api/*"` — wildcard matching
- `"/api/:id"` — path parameters

### FacilitatorConfig

```typescript
interface FacilitatorConfig {
  url: string;  // Facilitator service URL
  createAuthHeaders?: () => Promise<{
    verify?: Record<string, string>;
    settle?: Record<string, string>;
  }>;
}
```

## Supported Networks

### Fast
| Network | Description |
|---------|-------------|
| `fast-testnet` | Fast testnet |
| `fast-mainnet` | Fast mainnet |

### EVM
| Network | Chain ID |
|---------|----------|
| `arbitrum-sepolia` | 421614 |
| `arbitrum` | 42161 |
| `base-sepolia` | 84532 |
| `base` | 8453 |
| `ethereum` | 1 |

Network configurations (USDC addresses, Fast token IDs) are imported from `@fastxyz/allset-sdk` where available. EIP-3009 metadata (`name`, `version`) is maintained locally.

## Response Headers

On successful payment:

```
X-PAYMENT-RESPONSE: <base64-encoded JSON>
```

Decoded:
```json
{
  "success": true,
  "txHash": "0x...",
  "network": "arbitrum-sepolia",
  "payer": "0x..."
}
```

Note: `txHash` is only present for EVM payments (settlement transaction).

## Error Responses

### 402 Payment Required (No Payment Header)
```json
{
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "arbitrum-sepolia",
    "maxAmountRequired": "100000",
    "payTo": "0x...",
    "asset": "0x...",
    "extra": { "name": "USD Coin", "version": "2" }
  }]
}
```

### 402 Verification Failed
```json
{
  "error": "Invalid signature",
  "accepts": [...],
  "payer": "0x..."
}
```

### 402 Settlement Failed
```json
{
  "error": "Insufficient balance for transfer",
  "accepts": [...],
  "payer": "0x..."
}
```

## Facilitator

This package requires a facilitator service to verify and settle payments.

```typescript
// Local facilitator
{ url: "http://localhost:4020" }

// With authentication
{
  url: "https://facilitator.example.com",
  createAuthHeaders: async () => ({
    verify: { "Authorization": "Bearer ..." },
    settle: { "Authorization": "Bearer ..." },
  }),
}
```

Use `x402-facilitator` to run your own facilitator service.

## License

MIT
