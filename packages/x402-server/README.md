# x402-server

Server SDK for the x402 payment protocol. Create 402 Payment Required responses, verify payments, and protect your API endpoints.

## Installation

```bash
npm install x402-server
```

## Quick Start

### Express Middleware

```typescript
import express from "express";
import { paymentMiddleware } from "x402-server";

const app = express();

// Protect routes with x402 payments
app.use(paymentMiddleware(
  "0x1131623344cFdb04D06a9eD511BEc56FF6Ae4372", // Your receiving address
  {
    "GET /api/premium": {
      price: "$0.10",
      network: "arbitrum-sepolia",
      config: {
        description: "Premium API access",
      },
    },
    "GET /api/data/*": {
      price: "$0.05",
      network: "fastset-devnet",
    },
  },
  { url: "http://localhost:3002" } // Facilitator URL
));

// Your protected endpoints
app.get("/api/premium", (req, res) => {
  res.json({ data: "Premium content" });
});
```

### Supported Networks

| Network | Asset | Description |
|---------|-------|-------------|
| `arbitrum-sepolia` | USDC | Arbitrum testnet |
| `arbitrum` | USDC | Arbitrum mainnet |
| `base-sepolia` | USDC | Base testnet |
| `base` | USDC | Base mainnet |
| `fastset-devnet` | SETUSDC | FastSet testnet |
| `fastset-mainnet` | SETUSDC | FastSet mainnet |

## Core Functions

### createPaymentRequired

Create a 402 response body:

```typescript
import { createPaymentRequired } from "x402-server";

const response = createPaymentRequired(
  "fast16h3jkg5sv9ng2hwcjz08w3x2qvhxnzk5sw5awkqkgwrg3kv4hd7qylc73u",
  {
    price: "$0.10",
    network: "fastset-devnet",
  },
  "/api/resource"
);
// Returns: { error: "...", accepts: [...] }
```

### verifyAndSettle

Verify and settle a payment:

```typescript
import { verifyAndSettle, createPaymentRequirement } from "x402-server";

const paymentRequirement = createPaymentRequirement(payTo, config, resource);

const result = await verifyAndSettle(
  req.header("X-PAYMENT"),
  paymentRequirement,
  { url: "http://facilitator:3002" }
);

if (result.success) {
  console.log("Payment settled:", result.txHash);
}
```

### parsePaymentHeader

Parse an X-PAYMENT header:

```typescript
import { parsePaymentHeader } from "x402-server";

const payload = parsePaymentHeader(header);
// { x402Version: 1, scheme: "exact", network: "arbitrum-sepolia", payload: {...} }
```

## Route Patterns

The middleware supports flexible route patterns:

```typescript
{
  // Exact match with method
  "GET /api/resource": config,
  
  // Any method
  "/api/resource": config,
  
  // Wildcard
  "/api/premium/*": config,
  
  // Path parameters
  "/api/users/:id": config,
}
```

## Middleware Options

```typescript
paymentMiddleware(payTo, routes, facilitator, {
  // EVM: wait for on-chain settlement before delivering
  evmStrategy: "settle-first", // default
  
  // FastSet: tx is already on-chain, just verify
  fastsetStrategy: "verify-only", // default
});
```

## Simple Paywall

For single-endpoint protection:

```typescript
import { paywall } from "x402-server";

app.use("/api/premium", paywall(
  payTo,
  { price: "$0.10", network: "arbitrum-sepolia" },
  facilitator
));
```

## Response Headers

After successful payment, the middleware sets:

```
X-PAYMENT-RESPONSE: <base64-encoded-response>
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

## License

MIT
