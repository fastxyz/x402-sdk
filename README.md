# x402-sdk

SDK for the x402 HTTP Payment Protocol - monetize APIs with crypto payments.

## What is x402?

x402 is a payment protocol built on HTTP status code `402 Payment Required`. It enables:

- **Pay-per-request APIs**: Charge for individual API calls
- **No accounts needed**: Just sign and pay
- **Instant settlement**: Sub-second on FastSet, ~15s on EVM
- **Multi-chain**: FastSet, Arbitrum, Base, and more

## Packages

| Package | Description | npm |
|---------|-------------|-----|
| [x402-client](./packages/x402-client) | Client SDK - sign and pay for 402 content | `npm i x402-client` |
| [x402-server](./packages/x402-server) | Server SDK - create 402 responses, verify payments | `npm i x402-server` |
| [x402-facilitator](./packages/x402-facilitator) | Facilitator - verify signatures, settle on-chain | `npm i x402-facilitator` |

## Quick Start

### Client (pay for content)

```typescript
import { x402Pay } from 'x402-client';

const result = await x402Pay({
  url: 'https://api.example.com/premium-data',
  wallet: {
    type: 'evm',
    privateKey: '0x...',
    address: '0x...',
  },
});

console.log(result.body); // Your paid content
```

### Server (charge for content)

```typescript
import express from 'express';
import { paymentMiddleware } from 'x402-server';

const app = express();

// Protect routes with payment requirements
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

### Multi-Network Server (EVM + FastSet)

```typescript
app.use(paymentMiddleware(
  {
    evm: '0x1234...',       // EVM payment address
    fastset: 'fast1abc...',  // FastSet payment address
  },
  {
    'GET /api/evm/*': { price: '$0.10', network: 'arbitrum-sepolia' },
    'GET /api/fast/*': { price: '$0.01', network: 'fastset-devnet' },
  },
  { url: 'http://localhost:4020' }
));
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
     │  (EIP-3009 or FastSet tx)    │                                │
     │                              │                                │
     │  GET /api/data               │                                │
     │  X-PAYMENT: <signed>         │                                │
     │─────────────────────────────>│                                │
     │                              │                                │
     │                              │  POST /verify                  │
     │                              │─────────────────────────────────>
     │                              │                                │
     │                              │  { valid: true }               │
     │                              │<─────────────────────────────────
     │                              │                                │
     │  200 OK (FastSet)            │                                │
     │<─────────────────────────────│                                │
     │                              │                                │
     │                              │  POST /settle (EVM only)       │
     │                              │─────────────────────────────────>
     │                              │                                │
     │  200 OK (EVM)                │  { txHash: 0x... }             │
     │<─────────────────────────────│<─────────────────────────────────
```

**Key difference:**
- **FastSet**: Payment already on-chain → Verify → Serve content
- **EVM**: Payment is authorization only → Verify → Settle → Serve content

## Supported Networks

| Network | Chain ID | Token | Settlement |
|---------|----------|-------|------------|
| FastSet Devnet | - | SETUSDC | ~300ms |
| FastSet Mainnet | - | SETUSDC | ~300ms |
| Arbitrum Sepolia | 421614 | USDC | ~15s |
| Arbitrum | 42161 | USDC | ~15s |
| Base Sepolia | 84532 | USDC | ~15s |
| Base | 8453 | USDC | ~15s |

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

## License

MIT
