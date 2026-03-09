---
name: x402-sdk
description: >
  x402 HTTP Payment Protocol SDK for monetizing APIs with crypto payments. This monorepo contains
  three packages: client (pay for content), server (protect routes), and facilitator (verify/settle).
  See skills/ folder for detailed documentation on each package.
metadata:
  version: 0.1.0
---

# x402 SDK

SDK for the x402 HTTP Payment Protocol - monetize APIs with crypto payments.

## Skills

This monorepo contains three packages, each with its own skill file:

| Skill | Package | Description |
|-------|---------|-------------|
| [client-skill](./skills/client-skill.md) | `@fastxyz/x402-client` | Pay for 402-protected content |
| [server-skill](./skills/server-skill.md) | `@fastxyz/x402-server` | Protect API routes with payment requirements |
| [facilitator-skill](./skills/facilitator-skill.md) | `@fastxyz/x402-facilitator` | Verify signatures and settle on-chain |

**Most common use case:** Start with [client-skill.md](./skills/client-skill.md) for paying for protected APIs.

## Quick Overview

```
┌─────────┐                    ┌─────────┐                    ┌─────────────┐
│  Client │                    │  Server │                    │ Facilitator │
│ (payer) │                    │  (API)  │                    │  (settles)  │
└────┬────┘                    └────┬────┘                    └──────┬──────┘
     │                              │                                │
     │  GET /api/data               │                                │
     │─────────────────────────────>│                                │
     │                              │                                │
     │  402 Payment Required        │                                │
     │<─────────────────────────────│                                │
     │                              │                                │
     │  Sign payment + retry        │                                │
     │─────────────────────────────>│                                │
     │                              │  verify + settle               │
     │                              │───────────────────────────────>│
     │                              │                                │
     │  200 OK                      │<───────────────────────────────│
     │<─────────────────────────────│                                │
```

## Supported Networks

| Network | Type | Token | Settlement |
|---------|------|-------|------------|
| `fast-testnet` | Fast | fastUSDC | ~300ms |
| `fast-mainnet` | Fast | fastUSDC | ~300ms |
| `arbitrum-sepolia` | EVM | USDC | ~15s |
| `arbitrum` | EVM | USDC | ~15s |
| `base-sepolia` | EVM | USDC | ~15s |
| `base` | EVM | USDC | ~15s |
| `ethereum` | EVM | USDC | ~15s |

## Which Skill To Read

- **"Pay for an API"** → [skills/client-skill.md](./skills/client-skill.md)
- **"Protect my API with payments"** → [skills/server-skill.md](./skills/server-skill.md)
- **"Run a facilitator service"** → [skills/facilitator-skill.md](./skills/facilitator-skill.md)
- **"Full protocol flow"** → [README.md](./README.md)
