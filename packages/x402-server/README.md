# x402-server

Server SDK for the [x402 HTTP payment protocol](https://github.com/Pi-Squared-Inc/x402-sdk).

Protect API routes with crypto payments — works with Express and compatible frameworks.

## Install

```bash
npm install x402-server
```

## Quick Start

```typescript
import express from 'express';
import { paymentMiddleware } from 'x402-server';

const app = express();

// Protect routes with payment requirements
app.use(paymentMiddleware(
  "0x1234567890abcdef...",  // Your payment address
  {
    "GET /api/premium/*": {
      price: "$0.10",
      network: "arbitrum-sepolia",
    },
    "POST /api/ai/generate": {
      price: "$0.01", 
      network: "fastset-devnet",
    },
  },
  { url: "http://localhost:4020" }  // Facilitator URL
));

// Your protected routes
app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'Premium content!' });
});

app.listen(3000);
```

## How It Works

The middleware intercepts requests and handles payment verification:

### FastSet Payments (Already On-Chain)
```
Request → Verify with Facilitator → ✅ Serve Content
```
FastSet payments are submitted by the client before the request. The server only needs to verify the transaction certificate is valid.

### EVM Payments (Authorization Only)
```
Request → Verify with Facilitator → Settle with Facilitator → ✅ Serve Content
```
EVM payments use EIP-3009 `transferWithAuthorization`. The client signs an authorization, but the facilitator must submit it on-chain before content is served.

## API

### `paymentMiddleware(payTo, routes, facilitator)`

Creates Express middleware for payment-protected routes.

```typescript
function paymentMiddleware(
  payTo: string,                    // Address to receive payments
  routes: RoutesConfig,             // Route → payment config map
  facilitator: FacilitatorConfig    // Facilitator service config
): ExpressMiddleware;
```

### Route Configuration

```typescript
interface RouteConfig {
  price: string;      // "$0.10", "0.1 USDC", or "100000" (raw)
  network: string;    // "arbitrum-sepolia", "fastset-devnet", etc.
  config?: {
    description?: string;
    mimeType?: string;
    asset?: string;   // Custom token address
  };
}

// Route patterns support wildcards and HTTP methods
const routes = {
  "/api/data":           { ... },  // Any method
  "GET /api/weather/*":  { ... },  // GET only, wildcard path
  "POST /api/ai/:model": { ... },  // POST only, path params
};
```

### Facilitator Configuration

```typescript
interface FacilitatorConfig {
  url: string;  // Facilitator service URL
  createAuthHeaders?: () => Promise<{
    verify?: Record<string, string>;
    settle?: Record<string, string>;
  }>;
}
```

### `paywall(payTo, config, facilitator)`

Simple helper for single-route protection:

```typescript
import { paywall } from 'x402-server';

// Protect all routes with same config
app.use('/api/premium', paywall(
  "0x1234...",
  { price: "$0.05", network: "base-sepolia" },
  { url: "http://localhost:4020" }
));
```

## Supported Networks

### FastSet (Instant Settlement)
- `fastset-devnet` - FastSet testnet
- `fastset-mainnet` - FastSet mainnet

### EVM (EIP-3009)
- `arbitrum-sepolia` - Arbitrum testnet
- `arbitrum` - Arbitrum mainnet  
- `base-sepolia` - Base testnet
- `base` - Base mainnet

## Response Headers

On successful payment, the server sets:

```
X-PAYMENT-RESPONSE: <base64-encoded response>
```

Decoded response:
```json
{
  "success": true,
  "txHash": "0x...",      // EVM settlement tx (EVM only)
  "network": "arbitrum-sepolia",
  "payer": "0x..."
}
```

## Error Responses

When payment is required or fails:

```json
{
  "error": "X-PAYMENT header is required",
  "accepts": [
    {
      "scheme": "exact",
      "network": "arbitrum-sepolia",
      "maxAmountRequired": "100000",
      "payTo": "0x...",
      "asset": "0x...",
      "extra": { "name": "USD Coin", "version": "2" }
    }
  ]
}
```

## With Facilitator

This package requires a running facilitator service to verify and settle payments. Use `x402-facilitator` to run your own, or connect to a hosted service.

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

## License

MIT
