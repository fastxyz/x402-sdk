# x402-server

Server SDK for the [x402 HTTP payment protocol](https://github.com/Pi-Squared-Inc/x402-sdk).

Protect API routes with crypto payments — works with Express and compatible frameworks.

## Install

```bash
npm install x402-server
```

## Quick Start

### Single Network (EVM or FastSet)

```typescript
import express from 'express';
import { paymentMiddleware } from 'x402-server';

const app = express();

// EVM-only server
app.use(paymentMiddleware(
  "0x1234567890abcdef...",  // Your EVM address
  {
    "GET /api/premium/*": { price: "$0.10", network: "arbitrum-sepolia" },
  },
  { url: "http://localhost:4020" }  // Facilitator URL
));

// OR FastSet-only server
app.use(paymentMiddleware(
  "fast1abc123...",  // Your FastSet address
  {
    "GET /api/premium/*": { price: "$0.10", network: "fastset-devnet" },
  },
  { url: "http://localhost:4020" }
));

app.get('/api/premium/data', (req, res) => {
  res.json({ data: 'Premium content!' });
});

app.listen(3000);
```

### Multiple Networks (EVM + FastSet)

For servers that accept payments on both EVM and FastSet networks:

```typescript
import express from 'express';
import { paymentMiddleware } from 'x402-server';

const app = express();

app.use(paymentMiddleware(
  // Multiple payment addresses by network type
  {
    evm: "0x1234567890abcdef...",     // Receives EVM payments
    fastset: "fast1abc123xyz...",      // Receives FastSet payments
  },
  {
    // EVM routes - paid to your EVM address
    "GET /api/evm/data": { 
      price: "$0.10", 
      network: "arbitrum-sepolia" 
    },
    "POST /api/evm/generate": { 
      price: "$0.50", 
      network: "base-sepolia" 
    },
    
    // FastSet routes - paid to your FastSet address
    "GET /api/fast/data": { 
      price: "$0.01", 
      network: "fastset-devnet" 
    },
  },
  { url: "http://localhost:4020" }
));

app.get('/api/evm/data', (req, res) => {
  res.json({ data: 'EVM premium content!' });
});

app.get('/api/fast/data', (req, res) => {
  res.json({ data: 'FastSet premium content!' });
});

app.listen(3000);
```

## How It Works

The middleware intercepts requests and handles payment verification:

### FastSet Payments (Already On-Chain)
```
Client signs & submits TokenTransfer → Gets certificate
                    ↓
Request with X-PAYMENT (certificate) → Server
                    ↓
Server calls Facilitator /verify → Certificate valid?
                    ↓
              ✅ Serve Content
```
FastSet payments are submitted by the client before the request. The server only needs to verify the transaction certificate is valid — no settlement needed.

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

### `paymentMiddleware(payTo, routes, facilitator)`

Creates Express middleware for payment-protected routes.

```typescript
function paymentMiddleware(
  payTo: PayToConfig,               // Address(es) to receive payments
  routes: RoutesConfig,             // Route → payment config map
  facilitator: FacilitatorConfig    // Facilitator service config
): ExpressMiddleware;
```

### Payment Address Configuration

```typescript
// Option 1: Single address (for single network type)
const payTo = "0x1234...";           // EVM address
const payTo = "fast1abc...";         // FastSet address

// Option 2: Multiple addresses (for multi-network servers)
const payTo = {
  evm: "0x1234...",                  // Used for EVM network routes
  fastset: "fast1abc...",            // Used for FastSet network routes
};
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
| Network | Description |
|---------|-------------|
| `fastset-devnet` | FastSet testnet |
| `fastset-mainnet` | FastSet mainnet |

### EVM (EIP-3009)
| Network | Chain ID | Description |
|---------|----------|-------------|
| `arbitrum-sepolia` | 421614 | Arbitrum testnet |
| `arbitrum` | 42161 | Arbitrum mainnet |
| `base-sepolia` | 84532 | Base testnet |
| `base` | 8453 | Base mainnet |

## Response Headers

On successful payment, the server sets:

```
X-PAYMENT-RESPONSE: <base64-encoded response>
```

Decoded response:
```json
{
  "success": true,
  "txHash": "0x...",      // Settlement tx hash (EVM only)
  "network": "arbitrum-sepolia",
  "payer": "0x..."
}
```

## Error Responses

### No Payment Header (402)
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

### Invalid Payment (402)
```json
{
  "error": "Invalid signature",
  "accepts": [...],
  "payer": "0x..."
}
```

### Settlement Failed (402)
```json
{
  "error": "Insufficient balance for transfer",
  "accepts": [...],
  "payer": "0x..."
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
