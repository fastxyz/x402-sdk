---
name: x402-facilitator
description: >
  Facilitator service for verifying and settling x402 payments. Use when the user wants to run
  a facilitator, verify EIP-3009 signatures, settle EVM payments on-chain, or validate Fast
  transaction certificates. Trigger on facilitator setup, payment verification, or settlement.
metadata:
  package: "@fastxyz/x402-facilitator"
  version: 0.1.0
---

# x402-facilitator

Verify payment signatures and settle EVM payments on-chain. Required infrastructure for x402 servers.

## Install

```bash
npm install @fastxyz/x402-facilitator
```

> **Note:** This package depends on `@fastxyz/sdk` for BCS decoding of Fast transactions. It's installed automatically as a dependency.

## Quick Start

```typescript
import express from 'express';
import { createFacilitatorServer } from '@fastxyz/x402-facilitator';

const app = express();
app.use(express.json());

app.use(createFacilitatorServer({
  evmPrivateKey: '0xFacilitatorEVMPrivateKey...',
}));

app.listen(4020, () => console.log('Facilitator on :4020'));
```

## Files To Read

- `packages/x402-facilitator/src/index.ts` - Public exports
- `packages/x402-facilitator/src/server.ts` - Express server factory
- `packages/x402-facilitator/src/verify.ts` - Signature verification
- `packages/x402-facilitator/src/settle.ts` - On-chain settlement
- `packages/x402-facilitator/src/chains.ts` - Chain configurations
- `packages/x402-facilitator/src/fast-bcs.ts` - BCS decoding for Fast transactions

## Configuration

`createFacilitatorServer()` accepts a `FacilitatorConfig` object:

```typescript
interface FacilitatorConfig {
  // Required: Private key for settling EVM payments (pays gas)
  evmPrivateKey: `0x${string}`;
  
  // Optional: Custom RPC URLs
  rpcUrls?: {
    'arbitrum-sepolia'?: string;
    'ethereum-sepolia'?: string;
    // ...
  };
}

// Usage
const server = createFacilitatorServer({
  evmPrivateKey: '0x...',
  rpcUrls: {
    'arbitrum-sepolia': 'https://my-custom-rpc.com',
  },
});
```

## API Endpoints

### POST /verify

Verify a payment signature or certificate.

**Request (Fast payment):**
```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "fast-testnet",
    "payload": {
      "transactionCertificate": {
        "envelope": "0x...",
        "signatures": [
          ["0xcommitteePubKey1...", "0xsignature1..."],
          ["0xcommitteePubKey2...", "0xsignature2..."]
        ]
      }
    }
  },
  "paymentRequirement": {
    "scheme": "exact",
    "network": "fast-testnet",
    "maxAmountRequired": "100000",
    "payTo": "fast1abc123...",
    "maxTimeoutSeconds": 60
  }
}
```

> **Note:** The `network` can be any supported network: `fast-testnet`, `fast-mainnet`, `arbitrum-sepolia`, `arbitrum`, `ethereum-sepolia`, or `ethereum`.

**Response (valid):**
```json
{
  "isValid": true
}
```

**Response (invalid):**
```json
{
  "isValid": false,
  "reason": "Insufficient amount"
}
```

### POST /settle

Settle an EVM payment on-chain. Not needed for Fast payments (they're already on-chain).

**Request:**
```json
{
  "paymentPayload": {
    "x402Version": 1,
    "scheme": "exact",
    "network": "arbitrum-sepolia",
    "payload": {
      "signature": "0x...",
      "authorization": {
        "from": "0xBuyerAddress...",
        "to": "0xMerchantAddress...",
        "value": "100000",
        "validAfter": "0",
        "validBefore": "1741859999",
        "nonce": "0x1234567890abcdef..."
      }
    }
  },
  "paymentRequirement": {
    "scheme": "exact",
    "network": "arbitrum-sepolia",
    "maxAmountRequired": "100000",
    "payTo": "0xMerchantAddress...",
    "maxTimeoutSeconds": 60,
    "asset": "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d",
    "extra": {}
  }
}
```

**Response (success):**
```json
{
  "success": true,
  "txHash": "0xabc123...",
  "network": "arbitrum-sepolia"
}
```

**Response (failure):**
```json
{
  "success": false,
  "error": "Settlement failed: nonce already used"
}
```

### GET /supported

List supported networks.

**Response:**
```json
{
  "networks": [
    "fast-testnet",
    "fast-mainnet", 
    "arbitrum-sepolia",
    "arbitrum",
    "ethereum-sepolia",
    "ethereum"
  ]
}
```

## Verification Logic

### EVM Payments (EIP-3009)

1. Extract authorization params from payload
2. Recover signer from EIP-712 signature (`verifyTypedData`)
3. Check `from` matches recovered signer
4. Check `to` matches `paymentRequirement.payTo`
5. Check `value` >= `paymentRequirement.maxAmountRequired`
6. Check `validAfter <= now < validBefore`
7. Query on-chain USDC balance >= value

### Fast Payments

1. Decode transaction envelope (supports both versioned and legacy formats)
2. Check certificate structure (envelope + committee signatures)
3. Validate scheme matches (`fast`)
4. Validate network matches (`fast-testnet` or `fast-mainnet`)
5. Validate recipient matches `paymentRequirement.payTo`
6. Validate amount >= `paymentRequirement.maxAmountRequired`

**Versioned Transaction Support (Release20260303):**
The facilitator automatically detects and decodes both formats:
- Legacy: Raw BCS-encoded transaction
- Versioned: `{ Release20260303: transaction }` envelope

## Settlement Logic

### EVM Payments

1. Re-verify payment (same as /verify)
2. Check nonce not already used on-chain
3. Call `transferWithAuthorization()` on USDC contract
4. Wait for transaction confirmation
5. Return transaction hash

### Fast Payments

No settlement needed — transaction already on-chain when certificate was created.

## Using as a Library

```typescript
import { verify, settle } from '@fastxyz/x402-facilitator';

// Verify a payment
const verifyResult = await verify(paymentPayload, paymentRequirement);
if (!verifyResult.isValid) {
  console.log('Invalid:', verifyResult.reason);
}

// Settle an EVM payment
const settleResult = await settle(
  paymentPayload, 
  paymentRequirement,
  evmPrivateKey,
);
console.log('Settled:', settleResult.txHash);
```

## Chain Configuration

Default RPC URLs and USDC contract addresses are configured in `src/chains.ts`.

```typescript
// EVM chains
const EVM_CHAINS = {
  'arbitrum-sepolia': {
    chainId: 421614,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    usdc: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
  },
  // ...
};

// Fast RPC endpoints
const FAST_RPC_URLS = {
  'fast-testnet': 'https://testnet.api.fast.xyz/proxy',
  'fast-mainnet': 'https://api.fast.xyz/proxy',
};
```

## Troubleshooting

### `INVALID_SIGNATURE`
- Check EIP-712 domain matches (name: "USD Coin", version: "2", chainId, verifyingContract)
- Verify signature was created by the `from` address

### `INSUFFICIENT_BALANCE`
- Client doesn't have enough USDC on-chain
- Check balance before signing authorization

### `NONCE_ALREADY_USED`
- Each EIP-3009 nonce can only be used once
- Client must generate fresh random nonce for each payment

### `SETTLEMENT_FAILED`
- Facilitator wallet needs ETH for gas
- Check RPC URL is working
- Verify USDC contract address is correct

### Facilitator wallet setup

The facilitator wallet needs:
- ETH for gas on each supported EVM chain
- No USDC needed (it calls transferWithAuthorization, not transfer)

```bash
# Example: Fund facilitator on Arbitrum Sepolia
cast send --rpc-url $ARBITRUM_SEPOLIA_RPC \
  --private-key $FUNDER_KEY \
  $FACILITATOR_ADDRESS \
  --value 0.01ether
```
