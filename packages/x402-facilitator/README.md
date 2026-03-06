# x402-facilitator

Facilitator SDK for the [x402 HTTP payment protocol](https://github.com/Pi-Squared-Inc/x402-sdk).

Verify and settle x402 payments on-chain. Supports EVM (EIP-3009) and Fast networks.

## Install

```bash
npm install @fast/x402-facilitator
```

## Quick Start

### As Express Middleware

```typescript
import express from 'express';
import { createFacilitatorServer } from '@fast/x402-facilitator';

const app = express();
app.use(express.json());

// Add facilitator endpoints: /verify, /settle, /supported
app.use(createFacilitatorServer({
  evmPrivateKey: process.env.FACILITATOR_PRIVATE_KEY as `0x${string}`,
}));

app.listen(4020, () => {
  console.log('Facilitator running on http://localhost:4020');
});
```

### As a Library

```typescript
import { verify, settle } from '@fast/x402-facilitator';

// Verify a payment
const verifyResult = await verify(paymentPayload, paymentRequirement);
if (!verifyResult.isValid) {
  console.error('Invalid:', verifyResult.invalidReason);
}

// Settle an EVM payment
const settleResult = await settle(paymentPayload, paymentRequirement, {
  evmPrivateKey: '0x...',
});
```

## How It Works

### EVM Payments (EIP-3009)

1. **Verify**: Validate the EIP-3009 signature using `verifyTypedData`
   - Check signature recovers to claimed payer
   - Verify recipient matches payment requirement
   - Check timing (validAfter/validBefore)
   - Verify on-chain USDC balance

2. **Settle**: Submit `transferWithAuthorization` on-chain
   - Re-verify payment before settling
   - Check authorization nonce not already used
   - Submit transaction and wait for confirmation

### Fast Payments

1. **Verify**: Decode and validate transaction certificate
   - Check envelope and signatures exist
   - Decode BCS envelope to extract transaction details
   - Verify recipient matches `paymentRequirement.payTo`
   - Verify amount ≥ `maxAmountRequired` (with 18→6 decimal normalization)
   - Verify token matches `paymentRequirement.asset`

2. **Settle**: No-op — Fast transactions are already on-chain
   - Certificate proves consensus was reached
   - Returns success with transaction ID

## API

### Endpoints

When using `createFacilitatorServer()`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/verify` | POST | Verify a payment signature/certificate |
| `/settle` | POST | Settle a payment on-chain (EVM) |
| `/supported` | GET | List supported payment kinds |

### Request Format

```typescript
// POST /verify, /settle
{
  "paymentPayload": "base64-encoded-payload",  // or decoded object
  "paymentRequirements": {
    "scheme": "exact",
    "network": "arbitrum-sepolia",
    "maxAmountRequired": "100000",
    "payTo": "0x...",
    "asset": "0x...",
    // ...
  }
}
```

### Response Format

```typescript
// /verify response
{
  "isValid": true,
  "payer": "0x...",
  "network": "arbitrum-sepolia"
}

// /settle response
{
  "success": true,
  "transaction": "0x...",
  "txHash": "0x...",
  "network": "arbitrum-sepolia",
  "payer": "0x..."
}

// /supported response
{
  "paymentKinds": [
    {
      "x402Version": 1,
      "scheme": "exact",
      "network": "arbitrum-sepolia",
      "extra": { "asset": "0x...", "name": "USD Coin", "version": "2" }
    }
  ]
}
```

### Functions

```typescript
import { verify, settle, createFacilitatorServer } from '@fast/x402-facilitator';

// Verify payment
verify(paymentPayload, paymentRequirement): Promise<VerifyResponse>

// Settle payment
settle(paymentPayload, paymentRequirement, config): Promise<SettleResponse>

// Create Express middleware
createFacilitatorServer(config): ExpressMiddleware
```

### Configuration

```typescript
interface FacilitatorConfig {
  /** EVM private key for settling EIP-3009 authorizations */
  evmPrivateKey?: `0x${string}`;
  /** Fast RPC endpoint (optional) */
  fastRpcUrl?: string;
}
```

## Supported Networks

### EVM
| Network | Chain ID | USDC Address |
|---------|----------|--------------|
| `arbitrum-sepolia` | 421614 | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| `arbitrum` | 42161 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| `base-sepolia` | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| `base` | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| `ethereum` | 1 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |

### Fast
| Network | Description |
|---------|-------------|
| `fast-testnet` | Fast testnet |
| `fast-mainnet` | Fast mainnet |

## Error Reasons

### EVM Errors
| Reason | Description |
|--------|-------------|
| `unsupported_scheme` | Scheme is not "exact" |
| `invalid_network` | Network not supported or mismatch |
| `invalid_payload` | Missing required fields |
| `invalid_exact_evm_payload_signature` | Signature verification failed |
| `invalid_exact_evm_payload_recipient_mismatch` | Payment recipient doesn't match |
| `invalid_exact_evm_payload_authorization_value` | Amount too low |
| `invalid_exact_evm_payload_authorization_valid_before` | Authorization expired |
| `invalid_exact_evm_payload_authorization_valid_after` | Authorization not yet valid |
| `insufficient_funds` | Payer doesn't have enough USDC |
| `authorization_already_used` | Nonce already used |
| `facilitator_not_configured` | Missing evmPrivateKey |

### Fast Errors
| Reason | Description |
|--------|-------------|
| `missing_envelope` | Certificate has no envelope |
| `missing_signatures` | Certificate has no signatures |
| `insufficient_signatures` | Not enough committee signatures |
| `envelope_decode_failed` | Failed to decode BCS envelope |
| `not_a_token_transfer` | Transaction is not a TokenTransfer |
| `recipient_mismatch` | Recipient doesn't match payTo |
| `insufficient_amount` | Transfer amount too low |
| `token_mismatch` | Token doesn't match asset |

## License

MIT
