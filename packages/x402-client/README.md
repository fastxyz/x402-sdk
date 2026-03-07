# x402-client

Client SDK for the [x402 HTTP payment protocol](https://github.com/Pi-Squared-Inc/x402-sdk).

Pay for 402-protected content with Fast or EVM wallets.

## Install

```bash
npm install @fastxyz/x402-client
```

## Quick Start

```typescript
import { x402Pay } from '@fastxyz/x402-client';

// Pay with EVM wallet (Arbitrum, Base)
const result = await x402Pay({
  url: 'https://api.example.com/premium-data',
  wallet: {
    type: 'evm',
    privateKey: '0x...',
    address: '0x...',
  },
});

if (result.success) {
  console.log('Payment:', result.payment);
  console.log('Data:', result.body);
}
```

## Supported Networks

### Fast
- `fast-testnet` - Fast testnet
- `fast-mainnet` - Fast mainnet

### EVM (EIP-3009)
- `arbitrum-sepolia` - Arbitrum testnet
- `arbitrum` - Arbitrum mainnet
- `base-sepolia` - Base testnet
- `base` - Base mainnet

## API

### `x402Pay(params)`

Make a request to an x402-protected endpoint, automatically handling payment.

```typescript
interface X402PayParams {
  url: string;                           // URL of protected resource
  method?: string;                       // HTTP method (default: GET)
  headers?: Record<string, string>;      // Custom headers
  body?: string;                         // Request body
  wallet: Wallet | Wallet[];             // Wallet(s) to use
  verbose?: boolean;                     // Enable debug logging
}

interface X402PayResult {
  success: boolean;                      // Request succeeded
  statusCode: number;                    // HTTP status
  headers: Record<string, string>;       // Response headers
  body: unknown;                         // Response body
  payment?: PaymentDetails;              // Payment info (if paid)
  note: string;                          // Human-readable note
  logs?: string[];                       // Debug logs (if verbose)
}
```

### Wallet Types

```typescript
// EVM wallet (for Arbitrum, Base, etc.)
interface EvmWallet {
  type: 'evm';
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

// Fast wallet
interface FastWallet {
  type: 'fast';
  privateKey: string;   // Hex-encoded Ed25519 key
  publicKey: string;    // Hex-encoded public key
  address: string;      // bech32m address (fast1...)
  rpcUrl?: string;      // Optional custom RPC
}
```

## How It Works

1. **Initial Request**: Client makes request to protected URL
2. **402 Response**: Server returns `402 Payment Required` with accepted payment methods
3. **Payment**: Client creates and signs payment based on server requirements:

   **Case A: Fast Payment**
   - Client sends a `TokenTransfer` transaction directly to the server's Fast account
   - Transaction is submitted on-chain and a certificate is returned
   - Client includes the transaction certificate in the `X-PAYMENT` header

   **Case B: EVM Payment (Arbitrum, Base, etc.)**
   - Client checks if their EVM wallet has sufficient USDC balance
   - **If sufficient**: Client signs an EIP-3009 `transferWithAuthorization` and sends it as the `X-PAYMENT` header
   - **If insufficient**: Client automatically bridges fastUSDC from their Fast account to their EVM account via AllSet, then signs the EIP-3009 authorization

4. **Retry**: Client retries the original request with the `X-PAYMENT` header
5. **Content**: Server verifies payment (via facilitator) and returns the protected content

## Examples

### Multiple Wallets (with Auto-Bridge)

When you provide both Fast and EVM wallets, the SDK enables **auto-bridge**: if an EVM payment is required but your EVM wallet lacks sufficient USDC, the SDK will automatically bridge fastUSDC from your Fast account via AllSet.

```typescript
// Provide both wallets for auto-bridge support
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: [
    { type: 'fast', privateKey: '...', publicKey: '...', address: 'fast1...' },
    { type: 'evm', privateKey: '0x...', address: '0x...' },
  ],
});

// Check if bridging occurred
if (result.payment?.bridged) {
  console.log('Auto-bridged via:', result.payment.bridgeTxHash);
}
```

### Verbose Logging

```typescript
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: myWallet,
  verbose: true,
});

// Print debug logs
result.logs?.forEach(log => console.log(log));
```

### Manual Payment Flow

```typescript
import { parse402Response, buildPaymentHeader } from '@fastxyz/x402-client';

// Get requirements
const res = await fetch('https://api.example.com/data');
if (res.status === 402) {
  const requirements = await parse402Response(res);
  console.log('Payment required:', requirements);
  
  // Build payment manually...
  const payment = { /* your signed payment */ };
  const header = buildPaymentHeader(payment);
  
  // Retry with payment
  const paidRes = await fetch('https://api.example.com/data', {
    headers: { 'X-PAYMENT': header },
  });
}
```

## License

MIT
