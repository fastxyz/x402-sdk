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
| [x402-server](./packages/x402-server) | Server SDK - create 402 responses, verify payments | Coming soon |
| [x402-facilitator](./packages/x402-facilitator) | Facilitator - settle payments on-chain | Coming soon |

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
// Coming soon: x402-server
import { x402Middleware } from 'x402-server';

app.use('/api/premium', x402Middleware({
  price: '0.10',       // $0.10 USDC
  network: 'arbitrum-sepolia',
  recipient: '0x...',
  facilitator: 'https://facilitator.example.com',
}));
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
     │  200 OK                      │                                │
     │  { data: ... }               │                                │
     │<─────────────────────────────│                                │
     │                              │                                │
     │                              │  POST /settle (async)          │
     │                              │─────────────────────────────────>
     │                              │                                │
     │                              │  { txHash: 0x... }             │
     │                              │<─────────────────────────────────
```

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
