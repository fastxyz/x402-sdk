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

## Network Configuration

Network configs (asset addresses, decimals) are loaded from JSON files with hierarchical override.

### Config Loading Priority

1. **Custom path** (via `initNetworkConfig(path)`) — highest priority
2. **User config**: `~/.x402/networks.json` — local overrides
3. **Bundled defaults**: `data/networks.json` — fallback

### Config File Format

```json
{
  "arbitrum-sepolia": {
    "asset": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    "decimals": 6,
    "extra": {
      "name": "USD Coin",
      "version": "2"
    }
  },
  "fast-testnet": {
    "asset": "0xb4cf1b9e227bb6a21b959338895dfb39b8d2a96dfa1ce5dd633561c193124cb5",
    "decimals": 6
  }
}
```

### Customizing Your Network Config

To override or add networks locally, create `~/.x402/networks.json`:

```bash
mkdir -p ~/.x402
cat > ~/.x402/networks.json << 'EOF'
{
  "arbitrum-sepolia": {
    "asset": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    "decimals": 6,
    "extra": {
      "name": "USD Coin",
      "version": "2"
    }
  },
  "my-custom-network": {
    "asset": "0xMyTokenAddress...",
    "decimals": 18
  }
}
EOF
```

Your local config merges with bundled defaults — only specify networks you want to override or add.

### Programmatic Config

```typescript
import { initNetworkConfig } from '@fastxyz/x402-server';

// Load custom config file before using middleware
initNetworkConfig('./my-networks.json');
```

## Framework Compatibility

The middleware is designed for Express but works with any framework that supports Express-style middleware.

### Express (Native)

```typescript
import express from 'express';
const app = express();
app.use(paymentMiddleware(...));
```

### Fastify (with middie)

```typescript
import Fastify from 'fastify';
import middie from '@fastify/middie';

const app = Fastify();
await app.register(middie);
app.use(paymentMiddleware(...));
```

### Koa (with koa-connect)

```typescript
import Koa from 'koa';
import connect from 'koa-connect';

const app = new Koa();
app.use(connect(paymentMiddleware(...)));
```

### Other Frameworks

For frameworks with different APIs (Hono, Elysia, etc.), use the library functions directly instead of the middleware:

```typescript
import { 
  createPaymentRequired, 
  verifyPayment, 
  settlePayment 
} from '@fastxyz/x402-server';

// In your route handler:
// 1. Check for X-PAYMENT header
// 2. If missing, return createPaymentRequired(...)
// 3. If present, call verifyPayment() then settlePayment()
```

### Middleware Requirements

The middleware expects Express-style request/response objects:

| Object | Required Properties |
|--------|---------------------|
| `req` | `method`, `path`, `headers`, `body` |
| `res` | `status()`, `json()`, `setHeader()` |
| `next` | Function to call next middleware |

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
