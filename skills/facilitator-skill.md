---
name: x402-facilitator
description: >
  Facilitator service for verifying and settling x402 payments. Use when the user wants to run
  a facilitator, verify EIP-3009 signatures, settle EVM payments on-chain, or validate Fast
  transaction certificates.
metadata:
  package: "@fastxyz/x402-facilitator"
  short-description: Verify signatures and settle payments on-chain.
---

# x402-facilitator Skill

## When to Use This Skill

**USE this skill when the user wants to:**
- Run a payment verification/settlement service
- Verify EIP-3009 signatures (EVM payments)
- Validate Fast transaction certificates
- Settle EVM payments on-chain
- Integrate verification into custom flow

**DO NOT use this skill for:**
- Paying for content → use `x402-client`
- Protecting API routes → use `x402-server`
- General blockchain operations → use `@fastxyz/sdk` or `@fastxyz/allset-sdk`

---

## Decision Tree: Usage Mode

```
How do you want to use the facilitator?
│
├── Run as standalone service
│   └── Use createFacilitatorServer() with Express
│
├── Integrate into existing Express app
│   └── Use createFacilitatorServer() as middleware
│
└── Use verification/settlement in custom logic
    └── Import verify() and settle() functions directly
```

---

## Workflows

### 1. Run Standalone Facilitator

**When:** Need a dedicated facilitator service.

**Prerequisites:** EVM private key with ETH for gas on each chain.

**Steps:**

1. Install package:
   ```bash
   npm install @fastxyz/x402-facilitator express
   ```

2. Create server:
   ```typescript
   import express from 'express';
   import { createFacilitatorServer } from '@fastxyz/x402-facilitator';

   const app = express();
   app.use(express.json());  // Required!

   app.use(createFacilitatorServer({
     evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
   }));

   app.listen(4020, () => {
     console.log('Facilitator running on http://localhost:4020');
   });
   ```

3. Fund facilitator wallet with ETH on each supported chain.

4. Test health:
   ```bash
   curl http://localhost:4020/supported
   ```

---

### 2. Add to Existing Express App

**When:** Want facilitator endpoints on existing server.

**Steps:**

1. Add middleware:
   ```typescript
   import { createFacilitatorServer } from '@fastxyz/x402-facilitator';

   // Existing Express app
   app.use(express.json());
   
   // Add facilitator endpoints at /facilitator/*
   app.use('/facilitator', createFacilitatorServer({
     evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
   }));
   ```

2. Endpoints available at:
   - `POST /facilitator/verify`
   - `POST /facilitator/settle`
   - `GET /facilitator/supported`

---

### 3. Use as Library

**When:** Need custom verification/settlement logic.

**Steps:**

1. Import functions:
   ```typescript
   import { verify, settle } from '@fastxyz/x402-facilitator';
   ```

2. Verify a payment:
   ```typescript
   const verifyResult = await verify(paymentPayload, paymentRequirement);
   
   if (!verifyResult.isValid) {
     console.error('Invalid:', verifyResult.invalidReason);
     return;
   }
   
   console.log('Valid payment from:', verifyResult.payer);
   ```

3. Settle an EVM payment:
   ```typescript
   const settleResult = await settle(paymentPayload, paymentRequirement, {
     evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
   });
   
   if (settleResult.success) {
     console.log('Settled:', settleResult.txHash);
   } else {
     console.error('Failed:', settleResult.errorReason);
   }
   ```

---

### 4. Configure Verification Overrides

**When:** You need to override Fast verification settings.

**Steps:**

1. Pass supported overrides in config:
   ```typescript
   createFacilitatorServer({
     evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
     fastRpcUrl: 'https://my-fast-rpc.example.com/proxy',
     committeePublicKeys: {
       'fast-mainnet': ['0xvalidator1', '0xvalidator2'],
     },
   });
   ```

2. For Ethereum Sepolia, set `ETH_SEPOLIA_RPC` before starting the facilitator.

---

### 5. Fund Facilitator Wallet

**When:** Facilitator needs gas for EVM settlements.

**Steps:**

1. Get facilitator address from private key:
   ```typescript
   import { privateKeyToAccount } from 'viem/accounts';
   
   const account = privateKeyToAccount(process.env.FACILITATOR_KEY as `0x${string}`);
   console.log('Fund this address:', account.address);
   ```

2. Send ETH to facilitator on each chain:
   ```bash
   # Example: Base mainnet
   cast send --rpc-url https://mainnet.base.org \
     --private-key $FUNDER_KEY \
     $FACILITATOR_ADDRESS \
     --value 0.01ether
   ```

3. Recommended amounts:
   - Testnets: 0.01 ETH
   - Mainnets: 0.05-0.1 ETH (depends on usage)

---

## API Endpoints

### POST /verify

Verify a payment signature or certificate.

**Request:**
```json
{
  "paymentPayload": "base64-or-object",
  "paymentRequirements": {
    "scheme": "exact",
    "network": "base",
    "maxAmountRequired": "100000",
    "payTo": "0x..."
  }
}
```

**Response (valid):**
```json
{
  "isValid": true,
  "payer": "0x...",
  "network": "base"
}
```

**Response (invalid):**
```json
{
  "isValid": false,
  "invalidReason": "Insufficient amount"
}
```

### POST /settle

Settle an EVM payment on-chain. Not needed for Fast payments.

**Request:** Same as /verify

**Response (success):**
```json
{
  "success": true,
  "txHash": "0x...",
  "network": "base",
  "payer": "0x..."
}
```

**Response (failure):**
```json
{
  "success": false,
  "errorReason": "authorization_already_used"
}
```

### GET /supported

List supported payment kinds.

**Response:**
```json
{
  "paymentKinds": [
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "base",
      "extra": {
        "asset": "0x...",
        "name": "USD Coin",
        "version": "2"
      }
    },
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "fast-mainnet"
    }
  ]
}
```

---

## Common Mistakes (DO NOT)

1. **DO NOT** forget express.json() middleware:
   ```typescript
   // WRONG
   app.use(createFacilitatorServer({ ... }));
   
   // CORRECT
   app.use(express.json());
   app.use(createFacilitatorServer({ ... }));
   ```

2. **DO NOT** expose private key in logs or errors:
   ```typescript
   // WRONG
   console.log('Using key:', process.env.FACILITATOR_KEY);
   
   // CORRECT
   console.log('Facilitator address:', account.address);
   ```

3. **DO NOT** forget to fund facilitator wallet:
   - Facilitator needs ETH for gas on each EVM chain
   - No USDC needed (uses transferWithAuthorization)

4. **DO NOT** reuse nonces:
   ```typescript
   // Each EIP-3009 authorization has a unique nonce
   // Facilitator checks nonce hasn't been used before settling
   // If you see "authorization_already_used", client sent stale payment
   ```

---

## Error Handling

### Verification Errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `unsupported_scheme` | Scheme not "exact" | Check payment format |
| `invalid_network` | Network not supported | Check supported networks |
| `invalid_payload` | Missing required fields | Check payment structure |
| `invalid_signature` | Signature verification failed | Check client wallet |
| `recipient_mismatch` | Wrong payTo address | Check server config |
| `insufficient_amount` | Payment too low | Check price config |
| `insufficient_funds` | Payer has no USDC | Client needs to fund |

### Settlement Errors

| Error | Meaning | Fix |
|-------|---------|-----|
| `authorization_already_used` | Nonce reused | Client must use fresh nonce |
| `facilitator_not_configured` | Missing evmPrivateKey | Add private key to config |
| `settlement_failed` | On-chain tx failed | Check facilitator has gas |

---

## Verification Logic

### EVM Payments (EIP-3009)

1. Extract authorization params from payload
2. Recover signer from EIP-712 signature
3. Check `from` matches recovered signer
4. Check `to` matches `paymentRequirement.payTo`
5. Check `value` >= `paymentRequirement.maxAmountRequired`
6. Check `validAfter <= now < validBefore`
7. Query on-chain USDC balance >= value

### Fast Payments

1. Check certificate structure (envelope + signatures)
2. Verify sender signature over transaction
3. Verify committee signatures
4. Check recipient, amount, and token match requirements
5. No settlement needed (already on-chain)

---

## Supported Networks

### Mainnet

| Network | Type | Chain ID |
|---------|------|----------|
| `fast-mainnet` | Fast | — |
| `ethereum` | EVM | 1 |
| `arbitrum` | EVM | 42161 |
| `base` | EVM | 8453 |

### Testnet

| Network | Type | Chain ID |
|---------|------|----------|
| `fast-testnet` | Fast | — |
| `ethereum-sepolia` | EVM | 11155111 |
| `base-sepolia` | EVM | 84532 |
| `arbitrum-sepolia` | EVM | 421614 |

---

## Quick Reference

```typescript
import express from 'express';
import { createFacilitatorServer, verify, settle } from '@fastxyz/x402-facilitator';

// Standalone server
const app = express();
app.use(express.json());
app.use(createFacilitatorServer({
  evmPrivateKey: process.env.FACILITATOR_KEY as `0x${string}`,
}));
app.listen(4020);

// Library usage
const verifyResult = await verify(paymentPayload, paymentRequirement);
const settleResult = await settle(paymentPayload, paymentRequirement, {
  evmPrivateKey: '0x...',
});
```
