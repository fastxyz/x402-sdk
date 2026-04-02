---
name: x402-server
description: >
  Server SDK for protecting API routes with payment requirements. Use when the user wants to
  add pay-per-request to an Express API, create 402 Payment Required responses, or verify
  payments via a facilitator.
metadata:
  package: "@fastxyz/x402-server"
  short-description: Protect API routes with crypto payments.
---

# x402-server Skill

## When to Use This Skill

**USE this skill when the user wants to:**
- Protect API routes with payment requirements
- Return 402 Payment Required responses
- Accept payments on EVM or Fast networks
- Configure payment pricing and routes
- Integrate with a facilitator for verification

**DO NOT use this skill for:**
- Paying for content → use `x402-client`
- Running a facilitator → use `x402-facilitator`
- Custom payment verification logic → use facilitator directly

---

## Supported Networks

| Type | Network | Chain ID | Environment |
|------|---------|----------|-------------|
| EVM | `ethereum` | 1 | Mainnet |
| EVM | `ethereum-sepolia` | 11155111 | Testnet |
| EVM | `arbitrum` | 42161 | Mainnet |
| EVM | `arbitrum-sepolia` | 421614 | Testnet |
| EVM | `base` | 8453 | Mainnet |
| EVM | `base-sepolia` | 84532 | Testnet |
| Fast | `fast-mainnet` | — | Mainnet |
| Fast | `fast-testnet` | — | Testnet |

---

## Decision Tree: Payment Address Setup

```
How many networks will you accept payments on?
│
├── Single network (EVM or Fast)
│   └── Use single address string
│       paymentMiddleware('0x...', routes, facilitator)
│
└── Multiple networks (both EVM and Fast)
    └── Use address object
        paymentMiddleware({ evm: '0x...', fast: 'fast1...' }, routes, facilitator)
```

---

## Workflows

### 1. Basic Route Protection

**When:** Protect a single route with payment.

**Steps:**

1. Install package:
   ```bash
   npm install @fastxyz/x402-server
   ```

2. Add middleware to Express app:
   ```typescript
   import express from 'express';
   import { paymentMiddleware } from '@fastxyz/x402-server';

   const app = express();

   app.use(paymentMiddleware(
     '0xYourPaymentAddress...',
     {
       'GET /api/premium': { price: '$0.10', network: 'base' },
     },
     { url: 'http://localhost:4020' }  // Facilitator URL
   ));

   app.get('/api/premium', (req, res) => {
     res.json({ data: 'Premium content!' });
   });

   app.listen(3000);
   ```

3. Unpaid requests receive 402 Payment Required.

---

### 2. Multi-Route Protection

**When:** Protect multiple routes with different prices.

**Steps:**

1. Configure route patterns:
   ```typescript
   app.use(paymentMiddleware(
     '0xYourAddress...',
     {
       // Exact match
       'GET /api/premium': { price: '$0.10', network: 'base' },
       
       // Wildcard match
       'GET /api/premium/*': { price: '$0.05', network: 'base' },
       
       // POST with higher price
       'POST /api/generate': { price: '$1.00', network: 'arbitrum' },
       
       // Any method
       '/api/expensive': { price: '$5.00', network: 'base' },
     },
     { url: 'http://localhost:4020' }
   ));
   ```

2. Routes match in order: exact first, then wildcards.

---

### 3. Multi-Network Setup

**When:** Accept payments on both EVM and Fast networks.

**Steps:**

1. Provide both addresses:
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

2. Server uses correct address based on route's network.

---

### 4. Custom Facilitator Auth

**When:** Facilitator requires authentication headers.

**Steps:**

1. Provide createAuthHeaders function:
   ```typescript
   app.use(paymentMiddleware(
     '0xYourAddress...',
     routes,
     {
       url: 'https://facilitator.example.com',
       createAuthHeaders: async () => ({
         verify: { 'Authorization': `Bearer ${await getToken()}` },
         settle: { 'Authorization': `Bearer ${await getToken()}` },
       }),
     }
   ));
   ```

---

### 5. Manual Payment Handling

**When:** Need custom payment flow without middleware.

**Steps:**

1. Use helper functions directly:
   ```typescript
   import { 
     createPaymentRequirement,
     createPaymentRequired, 
     verifyPayment, 
     settlePayment 
   } from '@fastxyz/x402-server';

   app.get('/api/custom', async (req, res) => {
     const paymentHeader = req.headers['x-payment'];
     const payTo = '0xYourAddress...';
     const routeConfig = { price: '$0.10', network: 'base' };
     const requirement = createPaymentRequirement(payTo, routeConfig, req.path);
     
     if (!paymentHeader) {
       // Return 402 response
       return res.status(402).json(
         createPaymentRequired(payTo, routeConfig, req.path)
       );
     }

     // Verify payment
     const verification = await verifyPayment(
       paymentHeader,
       requirement,
       { url: 'http://localhost:4020' }
     );

     if (!verification.isValid) {
       return res.status(402).json({
         error: verification.invalidReason,
         accepts: [requirement],
       });
     }

     // Settle (EVM only)
     const settlement = await settlePayment(
       paymentHeader,
       requirement,
       { url: 'http://localhost:4020' }
     );

     if (!settlement.success) {
       return res.status(402).json({ error: settlement.errorReason });
     }

     // Serve content
     res.json({ data: 'Premium content!' });
   });
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
| `/api/:id` | Path with parameter |

### Route Options

```typescript
interface RouteConfig {
  price: string;           // Required: '$0.10', '0.1', or '100000'
  network: string;         // Required: Network identifier
  config?: {
    description?: string;  // Human-readable description
    mimeType?: string;     // Response MIME type hint
    asset?: string;        // Custom token address (default: USDC)
  };
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

## Common Mistakes (DO NOT)

1. **DO NOT** forget facilitator URL:
   ```typescript
   // WRONG
   paymentMiddleware('0x...', routes);
   
   // CORRECT
   paymentMiddleware('0x...', routes, { url: 'http://localhost:4020' });
   ```

2. **DO NOT** use wrong address type for network:
   ```typescript
   // WRONG: EVM address for Fast network
   paymentMiddleware('0x...', {
     '/api/fast': { network: 'fast-testnet', ... }
   }, ...);
   
   // CORRECT: Use address object
   paymentMiddleware({ evm: '0x...', fast: 'fast1...' }, {
     '/api/fast': { network: 'fast-testnet', ... }
   }, ...);
   ```

3. **DO NOT** mismatch route method:
   ```typescript
   // WRONG: Route requires GET but handler is POST
   app.use(paymentMiddleware('0x...', {
     'GET /api/data': { price: '$0.10', network: 'base' }
   }, ...));
   app.post('/api/data', handler);  // Won't be protected!
   
   // CORRECT: Match methods
   app.use(paymentMiddleware('0x...', {
     'POST /api/data': { price: '$0.10', network: 'base' }
   }, ...));
   app.post('/api/data', handler);
   ```

4. **DO NOT** add middleware after routes:
   ```typescript
   // WRONG: Middleware after route
   app.get('/api/data', handler);
   app.use(paymentMiddleware(...));
   
   // CORRECT: Middleware before routes
   app.use(paymentMiddleware(...));
   app.get('/api/data', handler);
   ```

---

## Error Handling

| Error | Meaning | Fix |
|-------|---------|-----|
| `X-PAYMENT header required` | No payment provided | Client needs to pay |
| `Invalid signature` | Payment verification failed | Check client wallet config |
| `Settlement failed` | On-chain settlement failed | Check facilitator has gas |
| `Facilitator unreachable` | Can't connect to facilitator | Check facilitator URL/status |

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

## Quick Reference

```typescript
import express from 'express';
import { paymentMiddleware } from '@fastxyz/x402-server';

const app = express();

// Single network
app.use(paymentMiddleware(
  '0xYourAddress...',
  { 'GET /api/*': { price: '$0.10', network: 'base' } },
  { url: 'http://localhost:4020' }
));

// Multi-network
app.use(paymentMiddleware(
  { evm: '0x...', fast: 'fast1...' },
  {
    'GET /api/evm/*': { price: '$0.10', network: 'base' },
    'GET /api/fast/*': { price: '$0.01', network: 'fast-testnet' },
  },
  { url: 'http://localhost:4020' }
));

app.get('/api/premium', (req, res) => {
  res.json({ data: 'Paid content!' });
});

app.listen(3000);
```
