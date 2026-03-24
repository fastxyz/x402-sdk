---
name: x402-client
description: >
  Client SDK for paying 402-protected APIs. Use when the user wants to pay for content behind
  a 402 paywall, sign EIP-3009 authorizations for EVM payments, submit Fast transaction
  certificates, or auto-bridge fastUSDC to USDC when paying EVM endpoints.
metadata:
  package: "@fastxyz/x402-client"
  short-description: Pay for 402-protected content with crypto.
---

# x402-client Skill

## When to Use This Skill

**USE this skill when the user wants to:**
- Pay for a 402-protected API endpoint
- Sign EIP-3009 authorization for EVM payment
- Submit Fast transaction and get certificate
- Auto-bridge fastUSDC → USDC for EVM payments
- Debug payment failures

**DO NOT use this skill for:**
- Protecting API routes → use `x402-server`
- Running a facilitator → use `x402-facilitator`
- General wallet operations → use `@fastxyz/sdk` or `@fastxyz/allset-sdk`

---

## Decision Tree: Which Wallet?

```
What network does the endpoint require?
│
├── Fast network (fast-testnet, fast-mainnet)
│   └── Use Fast wallet only
│
├── EVM network (ethereum-sepolia, base-sepolia, arbitrum, base, etc.)
│   │
│   └── Do you have USDC on that EVM chain?
│       ├── YES → Use EVM wallet only
│       └── NO → Do you have fastUSDC on Fast?
│                ├── YES → Use both wallets (auto-bridge)
│                └── NO → Fund a wallet first
│
└── Don't know the network?
    └── Use both wallets (auto-detects and bridges if needed)
```

---

## Workflows

### 1. Pay with EVM Wallet

**When:** Endpoint requires EVM payment (Arbitrum, Base, etc.) and you have USDC.

**Steps:**

1. Install package:
   ```bash
   npm install @fastxyz/x402-client
   ```

2. Call x402Pay with EVM wallet:
   ```typescript
   import { x402Pay } from '@fastxyz/x402-client';

   const result = await x402Pay({
     url: 'https://api.example.com/premium',
     wallet: {
       type: 'evm',
       privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
       address: '0xYourAddress...',
     },
   });
   ```

3. Check result:
   ```typescript
   if (result.success) {
     console.log('Content:', result.body);
     console.log('Paid:', result.payment?.amount, 'on', result.payment?.network);
   } else {
     console.error('Failed:', result.note);
   }
   ```

---

### 2. Pay with Fast Wallet

**When:** Endpoint requires Fast payment (fast-testnet, fast-mainnet).

**Steps:**

1. Call x402Pay with Fast wallet:
   ```typescript
   const result = await x402Pay({
     url: 'https://api.example.com/fast-endpoint',
     wallet: {
       type: 'fast',
       privateKey: process.env.FAST_PRIVATE_KEY!,  // 32-byte hex, no 0x
       publicKey: process.env.FAST_PUBLIC_KEY!,    // 32-byte hex
       address: 'fast1...',
     },
   });
   ```

2. Check result:
   ```typescript
   if (result.success) {
     console.log('Content:', result.body);
     // Fast payments settle instantly (~300ms)
   }
   ```

---

### 3. Pay with Auto-Bridge

**When:** Endpoint requires EVM payment but you only have fastUSDC on Fast.

**Steps:**

1. Provide both wallets:
   ```typescript
   const result = await x402Pay({
     url: 'https://api.example.com/base-endpoint',
     wallet: [
       {
         type: 'fast',
         privateKey: process.env.FAST_PRIVATE_KEY!,
         publicKey: process.env.FAST_PUBLIC_KEY!,
         address: 'fast1...',
       },
       {
         type: 'evm',
         privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`,
         address: '0x...',
       },
     ],
     verbose: true,  // See bridge progress
   });
   ```

2. SDK automatically:
   - Detects EVM payment required
   - Checks EVM USDC balance → insufficient
   - Bridges fastUSDC → USDC via AllSet (~3-4s)
   - Signs EIP-3009 authorization
   - Completes payment

3. Check bridge info:
   ```typescript
   if (result.payment?.bridged) {
     console.log('Bridged via:', result.payment.bridgeTxHash);
   }
   ```

---

### 4. Debug Payment Failures

**When:** Payment is failing and you need to diagnose.

**Steps:**

1. Enable verbose mode:
   ```typescript
   const result = await x402Pay({
     url: 'https://api.example.com/premium',
     wallet: myWallet,
     verbose: true,
   });
   ```

2. Check logs:
   ```typescript
   result.logs?.forEach(log => console.log(log));
   ```

3. Check common issues:
   - `INSUFFICIENT_BALANCE` → Fund wallet with USDC/fastUSDC
   - `INVALID_SIGNATURE` → Verify privateKey matches address
   - `BRIDGE_TIMEOUT` → Check Fast wallet has fastUSDC, retry

---

## Wallet Types

### EVM Wallet

```typescript
interface EvmWallet {
  type: 'evm';
  privateKey: `0x${string}`;  // 32-byte hex WITH 0x prefix
  address: `0x${string}`;     // EVM address
}
```

### Fast Wallet

```typescript
interface FastWallet {
  type: 'fast';
  privateKey: string;   // 32-byte hex WITHOUT 0x prefix
  publicKey: string;    // 32-byte hex
  address: string;      // bech32m address (fast1...)
  rpcUrl?: string;      // Optional custom RPC
}
```

---

## Common Mistakes (DO NOT)

1. **DO NOT** hardcode private keys:
   ```typescript
   // WRONG
   privateKey: '0xabc123...'
   
   // CORRECT
   privateKey: process.env.EVM_PRIVATE_KEY as `0x${string}`
   ```

2. **DO NOT** use 0x prefix for Fast private keys:
   ```typescript
   // WRONG
   { type: 'fast', privateKey: '0xabc123...' }
   
   // CORRECT
   { type: 'fast', privateKey: 'abc123...' }
   ```

3. **DO NOT** forget address field:
   ```typescript
   // WRONG
   { type: 'evm', privateKey: '0x...' }
   
   // CORRECT
   { type: 'evm', privateKey: '0x...', address: '0x...' }
   ```

4. **DO NOT** use single wallet when bridge is needed:
   ```typescript
   // WRONG: EVM wallet with no USDC, Fast wallet not provided
   x402Pay({ url: evmEndpoint, wallet: { type: 'evm', ... } });
   
   // CORRECT: Provide both for auto-bridge
   x402Pay({ url: evmEndpoint, wallet: [fastWallet, evmWallet] });
   ```

---

## Error Handling

| Error | Meaning | Fix |
|-------|---------|-----|
| `INSUFFICIENT_BALANCE` | Not enough USDC/fastUSDC | Fund wallet or use auto-bridge |
| `INVALID_SIGNATURE` | Key doesn't match address | Verify wallet config |
| `BRIDGE_TIMEOUT` | Bridge took too long | Check Fast balance, retry |
| `NETWORK_NOT_SUPPORTED` | Unknown network in 402 | Check endpoint configuration |
| `PAYMENT_REJECTED` | Facilitator rejected payment | Check facilitator logs |

---

## Options Reference

```typescript
interface X402PayParams {
  url: string;                    // Required: URL to pay for
  wallet: Wallet | Wallet[];      // Required: Wallet(s) to use
  method?: string;                // HTTP method (default: 'GET')
  headers?: Record<string, string>;
  body?: string;                  // Request body for POST/PUT
  verbose?: boolean;              // Log progress (default: false)
}
```

## Return Value Reference

```typescript
interface X402PayResult {
  success: boolean;               // Request succeeded
  statusCode: number;             // HTTP status code
  headers: Record<string, string>;
  body: unknown;                  // Parsed response body
  payment?: {
    network: string;              // Network used
    amount: string;               // Amount paid
    txHash?: string;              // Transaction hash
    bridged?: boolean;            // Whether bridge was used
    bridgeTxHash?: string;        // Bridge transaction hash
  };
  note: string;                   // Human-readable status
  logs?: string[];                // Debug logs (if verbose)
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
| `base-sepolia` | EVM | USDC |
| `arbitrum-sepolia` | EVM | USDC |

---

## Quick Reference

```typescript
import { x402Pay } from '@fastxyz/x402-client';

// EVM payment
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: { type: 'evm', privateKey: '0x...', address: '0x...' },
});

// Fast payment
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: { type: 'fast', privateKey: '...', publicKey: '...', address: 'fast1...' },
});

// Auto-bridge
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: [fastWallet, evmWallet],
  verbose: true,
});
```
