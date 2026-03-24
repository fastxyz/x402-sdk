# x402-server

Server SDK for the [x402 HTTP payment protocol](https://github.com/fastxyz/x402-sdk) — protect API routes with crypto payments.

## Install

```bash
npm install @fastxyz/x402-server
```

---

## Quick Start

```typescript
import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';

const app = express();

app.use(paymentMiddleware(
  '0xYourPaymentAddress...',
  {
    'GET /api/premium/*': { price: '$0.10', network: 'base' },
  },
  { url: 'http://localhost:4020' }
));

app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'Premium content!' });
});

app.listen(3000);
```

---

## Payment Address Setup

### Single Network

```typescript
app.use(paymentMiddleware(
  '0xYourAddress...',  // EVM address
  routes,
  { url: 'http://localhost:4020' }
));
```

### Multi-Network (EVM + Fast)

```typescript
app.use(paymentMiddleware(
  {
    evm: '0xYourEvmAddress...',
    fast: 'fast1YourFastAddress...',
  },
  {
    'GET /api/evm/*': { price: '$0.10', network: 'base' },
    'GET /api/fast/*': { price: '$0.01', network: 'fast-testnet' },
  },
  { url: 'http://localhost:4020' }
));
```

---

## Route Configuration

### Route Patterns

| Pattern | Matches |
|---------|---------|
| `/api/data` | Exact path, any method |
| `GET /api/data` | Exact path, GET only |
| `/api/*` | Any path under /api/ |
| `GET /api/*` | Any path under /api/, GET only |

### Route Options

```typescript
interface RouteConfig {
  price: string;         // '$0.10', '0.1', or '100000' (raw units)
  network: string;       // Network identifier
  description?: string;  // Human-readable description
  mimeType?: string;     // Response MIME type hint
}
```

### Price Formats

All equivalent ($0.10 USDC):

```typescript
{ price: '$0.10' }      // Dollar notation
{ price: '0.1' }        // Decimal USDC
{ price: '100000' }     // Raw units (6 decimals)
```

---

## API

### paymentMiddleware(payTo, routes, facilitator)

| Parameter | Type | Description |
|-----------|------|-------------|
| `payTo` | `string \| { evm?: string, fast?: string }` | Payment address(es) |
| `routes` | `Record<string, RouteConfig>` | Route patterns → payment config |
| `facilitator` | `{ url: string, createAuthHeaders?: Function }` | Facilitator config |

### Facilitator Config

```typescript
{
  url: 'http://localhost:4020',
  createAuthHeaders?: async () => ({
    verify: { 'Authorization': 'Bearer ...' },
    settle: { 'Authorization': 'Bearer ...' },
  }),
}
```

---

## Payment Flows

### Fast Payments (Already On-Chain)

```
Client submits tx → Gets certificate → Sends to server → Server verifies → Content
```

Fast payments are settled by the client before the request. Server only verifies the certificate.

### EVM Payments (Authorization)

```
Client signs auth → Sends to server → Server verifies → Facilitator settles → Content
```

EVM payments use EIP-3009. The facilitator submits the transaction on-chain.

---

## 402 Response Format

When payment is required:

```json
{
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "100000",
    "payTo": "0x...",
    "asset": "0x...",
    "maxTimeoutSeconds": 60,
    "extra": { "name": "USD Coin", "version": "2" }
  }]
}
```

---

## Supported Networks

### Mainnet

| Network | Type | Token |
|---------|------|-------|
| `fast-mainnet` | Fast | USDC |
| `arbitrum` | EVM | USDC |
| `base` | EVM | USDC |

### Testnet

| Network | Type | Token |
|---------|------|-------|
| `fast-testnet` | Fast | testUSDC |
| `ethereum-sepolia` | EVM | USDC |
| `arbitrum-sepolia` | EVM | USDC |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `X-PAYMENT header required` | No payment provided | Client needs to pay |
| `Invalid signature` | Verification failed | Check client wallet |
| `Settlement failed` | On-chain issue | Check facilitator has gas |
| `Facilitator unreachable` | Connection failed | Check facilitator URL |

---

## License

MIT
