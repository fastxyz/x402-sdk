---
name: x402-server
description: >
  Server SDK for protecting API routes with payment requirements. Use when the user wants to add
  pay-per-request to an Express API, create 402 Payment Required responses, or verify payments
  via a facilitator. Trigger on paymentMiddleware, route protection, or payment verification.
metadata:
  package: "@fastxyz/x402-server"
  version: 0.1.0
---

# x402-server

Protect API routes with payment requirements. Returns 402 Payment Required for unpaid requests.

## Install

```bash
npm install @fastxyz/x402-server
```

## Quick Start

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

## Files To Read

- `packages/x402-server/src/index.ts` - Public exports
- `packages/x402-server/src/middleware.ts` - `paymentMiddleware()` implementation
- `packages/x402-server/src/payment.ts` - Payment verification helpers
- `packages/x402-server/src/types.ts` - Route config types

## Middleware Configuration

### Single Payment Address

```typescript
app.use(paymentMiddleware(
  '0x1234...',  // EVM address or fast1... address
  routes,
  facilitatorConfig,
));
```

### Multi-Network Addresses

```typescript
app.use(paymentMiddleware(
  {
    evm: '0x1234...',        // For EVM payments
    fast: 'fast1abc...',     // For Fast payments
  },
  routes,
  facilitatorConfig,
));
```

## Route Configuration

```typescript
const routes = {
  // Exact match
  'GET /api/premium': { 
    price: '$0.10', 
    network: 'arbitrum-sepolia' 
  },
  
  // Wildcard match
  'GET /api/premium/*': { 
    price: '$0.05', 
    network: 'fast-testnet' 
  },
  
  // Multiple methods
  'POST /api/generate': { 
    price: '$1.00', 
    network: 'arbitrum' 
  },
};
```

### Route Options

```typescript
interface RouteConfig {
  price: string;           // e.g., '$0.10', '0.1', '100000' (raw units)
  network: string;         // Network identifier
  description?: string;    // Human-readable description
  mimeType?: string;       // Response MIME type hint
  outputSchema?: object;   // JSON schema for response
}
```

## Facilitator Configuration

```typescript
const facilitatorConfig = {
  url: 'http://localhost:4020',  // Facilitator base URL
  timeout?: 30000,               // Request timeout (ms)
};
```

## 402 Response Format

When a route requires payment, the middleware returns:

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

## Payment Verification Flow

1. Client sends request with `X-PAYMENT` header
2. Middleware extracts and decodes payment payload
3. Middleware calls facilitator `/verify` endpoint
4. If valid, middleware calls facilitator `/settle` (EVM only)
5. If settlement succeeds, request proceeds to handler
6. If any step fails, returns 402 or error

## Manual Payment Handling

For custom flows without middleware:

```typescript
import { 
  createPaymentRequired, 
  verifyPayment, 
  settlePayment 
} from '@fastxyz/x402-server';

// Create 402 response
const paymentRequired = createPaymentRequired({
  payTo: '0x1234...',
  price: '$0.10',
  network: 'arbitrum-sepolia',
  resource: req.url,
});

// Verify payment header
const verification = await verifyPayment(
  req.headers['x-payment'],
  paymentRequired,
  facilitatorUrl,
);

// Settle payment (EVM only)
if (verification.isValid) {
  const settlement = await settlePayment(
    req.headers['x-payment'],
    paymentRequired,
    facilitatorUrl,
  );
}
```

## Supported Networks

| Network | Type | Token |
|---------|------|-------|
| `fast-testnet` | Fast | fastUSDC |
| `fast-mainnet` | Fast | fastUSDC |
| `arbitrum-sepolia` | EVM | USDC |
| `arbitrum` | EVM | USDC |
| `ethereum-sepolia` | EVM | USDC |
| `ethereum` | EVM | USDC |

## Troubleshooting

### Payments not being verified
- Check facilitator URL is correct and reachable
- Check facilitator is running and healthy (`GET /supported`)

### Wrong payment amount
- Price can be `$0.10` (parsed), `0.1` (decimal), or `100000` (raw units)
- USDC uses 6 decimals: `$0.10` = `100000` raw units

### Route not matching
- Routes use exact match first, then wildcard
- Method must match (GET, POST, etc.)
- Path matching is case-sensitive
