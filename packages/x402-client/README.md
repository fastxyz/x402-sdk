# x402-client

Client SDK for the [x402 HTTP payment protocol](https://github.com/Pi-Squared-Inc/x402-sdk).

Pay for 402-protected content with FastSet or EVM wallets.

## Install

```bash
npm install x402-client
```

## Quick Start

```typescript
import { x402Pay } from 'x402-client';

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

### FastSet
- `fastset-devnet` - FastSet testnet
- `fastset-mainnet` - FastSet mainnet

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

// FastSet wallet
interface FastSetWallet {
  type: 'fastset';
  privateKey: string;   // Hex-encoded Ed25519 key
  publicKey: string;    // Hex-encoded public key
  address: string;      // bech32m address (fast1...)
  rpcUrl?: string;      // Optional custom RPC
}
```

## How It Works

1. **Initial Request**: Client makes request to protected URL
2. **402 Response**: Server returns `402 Payment Required` with payment requirements
3. **Payment**: Client signs payment (TokenTransfer on FastSet, EIP-3009 on EVM)
4. **Retry**: Client retries request with `X-PAYMENT` header containing payment proof
5. **Content**: Server verifies payment and returns content

## Examples

### Multiple Wallets

```typescript
// Provide both wallets - SDK picks the right one
const result = await x402Pay({
  url: 'https://api.example.com/data',
  wallet: [
    { type: 'fastset', privateKey: '...', publicKey: '...', address: 'fast1...' },
    { type: 'evm', privateKey: '0x...', address: '0x...' },
  ],
});
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
import { parse402Response, buildPaymentHeader } from 'x402-client';

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
