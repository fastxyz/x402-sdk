# x402-facilitator

Facilitator SDK for the [x402 HTTP payment protocol](https://github.com/fastxyz/x402-sdk) — verify signatures and settle payments on-chain.

## Install

```bash
npm install @fastxyz/x402-facilitator
```

---

## Quick Start

### As Express Middleware

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

### As Library

```typescript
import { verify, settle } from '@fastxyz/x402-facilitator';

// Verify a payment
const verifyResult = await verify(paymentPayload, paymentRequirement);
if (!verifyResult.isValid) {
  console.error('Invalid:', verifyResult.invalidReason);
}

// Settle an EVM payment
const settleResult = await settle(paymentPayload, paymentRequirement, {
  evmPrivateKey: '0x...',
});
console.log('Settled:', settleResult.txHash);
```

---

## Configuration

```typescript
interface FacilitatorConfig {
  evmPrivateKey?: `0x${string}`;             // Needed for EVM settlement
  fastRpcUrl?: string;                       // Override Fast verification RPC
  committeePublicKeys?: Record<string, string[]>;
  chains?: Record<string, Chain>;            // Advanced chain overrides
}
```

For Ethereum Sepolia verification, you can also override the default RPC with the `ETH_SEPOLIA_RPC` environment variable.

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

**Response:**
```json
{
  "isValid": true,
  "payer": "0x...",
  "network": "base"
}
```

### POST /settle

Settle an EVM payment on-chain. Not needed for Fast payments.

**Response (success):**
```json
{
  "success": true,
  "txHash": "0x...",
  "network": "base",
  "payer": "0x..."
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

## Verification Logic

### EVM Payments (EIP-3009)

1. Recover signer from EIP-712 signature
2. Check `from` matches recovered signer
3. Check `to` matches `paymentRequirement.payTo`
4. Check `value` >= `maxAmountRequired`
5. Check `validAfter <= now < validBefore`
6. Verify on-chain USDC balance

### Fast Payments

1. Validate certificate structure
2. Verify sender signature
3. Verify committee signatures
4. Check recipient, amount, token match
5. No settlement needed (already on-chain)

---

## Settlement Logic

### EVM Payments

1. Re-verify payment
2. Check nonce not already used
3. Call `transferWithAuthorization()` on USDC
4. Wait for confirmation
5. Return transaction hash

### Fast Payments

No-op — transaction already on-chain when certificate was created.

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

## Wallet Setup

The facilitator wallet needs:
- **ETH for gas** on each supported EVM chain
- **No USDC needed** (uses `transferWithAuthorization`)

```bash
# Get facilitator address
npx ts-node -e "
  import { privateKeyToAccount } from 'viem/accounts';
  console.log(privateKeyToAccount(process.env.FACILITATOR_KEY).address);
"

# Fund on Base mainnet
cast send --rpc-url https://mainnet.base.org \
  --private-key $FUNDER_KEY \
  $FACILITATOR_ADDRESS \
  --value 0.05ether
```

---

## Troubleshooting

### Verification Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_signature` | Signature verification failed | Check client wallet |
| `recipient_mismatch` | Wrong payTo address | Check server config |
| `insufficient_amount` | Payment too low | Check price config |
| `insufficient_funds` | Payer has no USDC | Client needs to fund |

### Settlement Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `authorization_already_used` | Nonce reused | Client must use fresh nonce |
| `facilitator_not_configured` | Missing evmPrivateKey | Add key to config |
| `settlement_failed` | On-chain tx failed | Check facilitator has gas |

---

## License

MIT
